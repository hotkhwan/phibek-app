// src/lib/stores/wsHub.ts
// Singleton browser WSS client for klynx-api realtime hub.
// Contract: klynx-api/docs/contracts/realtime-wss.md §5.1, §5.2, §6.1, §6.2, §6.10.

import { browser } from '$app/environment'
import { env } from '$env/dynamic/public'
import { writable } from 'svelte/store'
import { api } from '$lib/utils/fetch'
import { auth } from '$lib/stores/auth'
import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
import type { WsTopic } from '$lib/realtime/wsTopics'

export type LiveStatus = 'off' | 'on' | 'error' | 'reconnecting'

type TopicHandler<T = unknown> = (topic: WsTopic, ts: string, data: T) => void
type DeniedHandler = (topic: WsTopic, reason: string) => void

type TopicEntry = {
  handlers: Set<TopicHandler>
  deniedHandlers: Set<DeniedHandler>
}

type NegotiateResponse = {
  code?: string
  status?: boolean
  message?: string
  details?: {
    ticket: string
    expiresAt: string
    wsUrl: string
  }
}

type EventFrame = {
  op: 'event'
  topic: WsTopic
  ts: string
  data: unknown
}

type SubscribedFrame = {
  op: 'subscribed'
  topics: WsTopic[]
  denied?: Array<{ topic: WsTopic; reason: string }>
  id?: string
}

type UnsubscribedFrame = {
  op: 'unsubscribed'
  topics: WsTopic[]
  id?: string
}

type PingFrame = {
  op: 'ping'
  ts: string
}

type ErrorFrame = {
  op: 'error'
  code: 'malformed_frame' | 'unknown_topic' | 'forbidden' | 'rate_limited' | 'too_many_connections' | 'unauthorized'
  message?: string
  id?: string
}

type ServerFrame = EventFrame | SubscribedFrame | UnsubscribedFrame | PingFrame | ErrorFrame

const IDLE_CLOSE_GRACE_MS = 500

const _status = writable<LiveStatus>('off')
const _lastError = writable<string | null>(null)

export const wsHubStatus = { subscribe: _status.subscribe }
export const wsHubLastError = { subscribe: _lastError.subscribe }

const topicEntries = new Map<WsTopic, TopicEntry>()

let ws: WebSocket | null = null
let connecting = false
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pingFallbackTimer: ReturnType<typeof setTimeout> | null = null
let idleCloseTimer: ReturnType<typeof setTimeout> | null = null
let correlationCounter = 0
let contextWatching = false
let currentOrgId: string | null | undefined
let connectionGeneration = 0

function isEnabled() {
  return env.PUBLIC_REALTIME_HUB_ENABLED === 'true'
}

function setStatus(status: LiveStatus, error: string | null = null) {
  _status.set(isEnabled() ? status : 'off')
  _lastError.set(error)
}

function hasActiveSubscriptions() {
  for (const entry of topicEntries.values()) {
    if (entry.handlers.size > 0) return true
  }
  return false
}

function activeTopics() {
  const topics: WsTopic[] = []
  for (const [topic, entry] of topicEntries) {
    if (entry.handlers.size > 0) topics.push(topic)
  }
  return topics
}

function nextCorrelationId() {
  correlationCounter = (correlationCounter + 1) % Number.MAX_SAFE_INTEGER
  return `s${Date.now().toString(36)}-${correlationCounter.toString(36)}`
}

function clearTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (pingFallbackTimer) clearTimeout(pingFallbackTimer)
  reconnectTimer = null
  pingFallbackTimer = null
}

function cancelIdleClose() {
  if (!idleCloseTimer) return
  clearTimeout(idleCloseTimer)
  idleCloseTimer = null
}

function sendFrame(frame: Record<string, unknown>) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  try {
    ws.send(JSON.stringify(frame))
  } catch (err) {
    console.warn('[wsHub] send failed', err)
  }
}

async function negotiate() {
  const token = auth.get().user?.token
  if (!token) throw new Error('no auth token; defer realtime until login completes')
  const orgId = currentOrgId
  if (!orgId) throw new Error('no active organization; defer realtime until org context is ready')

  const response = await api<NegotiateResponse, Record<string, never>>('/ws/v1/negotiate', {
    method: 'POST',
    body: {}
  })

  if (!response.details?.ticket || !response.details.wsUrl) {
    throw new Error(`negotiate response missing ticket/wsUrl (status=${String(response.status)})`)
  }

  return response.details
}

function scheduleReconnect(reason: string) {
  if (!browser || !isEnabled()) return
  if (!hasActiveSubscriptions()) {
    setStatus('off')
    return
  }

  reconnectAttempt += 1
  const baseMs = Math.min(30_000, Math.pow(2, reconnectAttempt - 1) * 1000)
  const jitter = baseMs * (Math.random() * 0.4 - 0.2)
  const delayMs = Math.max(500, Math.round(baseMs + jitter))

  setStatus('reconnecting', reason)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void openConnection()
  }, delayMs)
}

function armPingFallback() {
  if (pingFallbackTimer) clearTimeout(pingFallbackTimer)
  pingFallbackTimer = setTimeout(() => {
    try {
      ws?.close(4000, 'idle_timeout')
    } catch {
      // ignore close races
    }
  }, 90_000)
}

function handleFrame(frame: ServerFrame) {
  armPingFallback()

  switch (frame.op) {
    case 'event': {
      const entry = topicEntries.get(frame.topic)
      if (!entry) return
      for (const handler of entry.handlers) {
        try {
          handler(frame.topic, frame.ts, frame.data)
        } catch (err) {
          console.error('[wsHub] topic handler failed', frame.topic, err)
        }
      }
      break
    }
    case 'subscribed': {
      for (const denied of frame.denied ?? []) {
        const entry = topicEntries.get(denied.topic)
        if (!entry) continue
        for (const onDenied of entry.deniedHandlers) {
          try {
            onDenied(denied.topic, denied.reason)
          } catch (err) {
            console.error('[wsHub] denied handler failed', denied.topic, err)
          }
        }
      }
      break
    }
    case 'unsubscribed':
      break
    case 'ping':
      sendFrame({ op: 'pong' })
      break
    case 'error':
      setStatus(frame.code === 'unauthorized' ? 'reconnecting' : 'error', frame.message ?? frame.code)
      break
  }
}

function forceReconnect(reason: string) {
  connectionGeneration += 1
  clearTimers()
  cancelIdleClose()
  connecting = false

  const old = ws
  ws = null
  if (old) {
    old.onopen = null
    old.onmessage = null
    old.onerror = null
    old.onclose = null
    try {
      old.close(1000, reason)
    } catch {
      // ignore close races
    }
  }

  if (hasActiveSubscriptions()) {
    void openConnection()
  } else {
    setStatus('off')
  }
}

function ensureContextWatchers() {
  if (!browser || contextWatching) return
  contextWatching = true

  activeWorkspaceId.subscribe((orgId) => {
    const previous = currentOrgId
    currentOrgId = orgId
    if (previous !== undefined && previous !== orgId && hasActiveSubscriptions()) {
      forceReconnect('active_org_changed')
    }
  })

  auth.subscribe((state) => {
    if (state.user?.token && hasActiveSubscriptions() && !ws && !connecting) {
      void openConnection()
    }
  })
}

async function openConnection() {
  if (!browser || !isEnabled()) return
  if (connecting || (ws && ws.readyState === WebSocket.OPEN)) return
  if (!hasActiveSubscriptions()) {
    setStatus('off')
    return
  }

  const generation = connectionGeneration
  connecting = true
  setStatus('reconnecting')

  try {
    const details = await negotiate()
    if (generation !== connectionGeneration) {
      connecting = false
      return
    }

    ws = new WebSocket(details.wsUrl)
    ws.onopen = () => {
      connecting = false
      reconnectAttempt = 0
      setStatus('on')
      const topics = activeTopics()
      if (topics.length > 0) {
        sendFrame({ op: 'subscribe', topics, id: nextCorrelationId() })
      }
      armPingFallback()
    }
    ws.onmessage = (message) => {
      let frame: ServerFrame
      try {
        frame = JSON.parse(String(message.data)) as ServerFrame
      } catch {
        console.warn('[wsHub] malformed server frame')
        return
      }
      handleFrame(frame)
    }
    ws.onerror = () => {
      setStatus('error', 'socket error')
    }
    ws.onclose = (event) => {
      connecting = false
      clearTimers()
      ws = null
      const reason = event.code === 4401 ? 'jwt_expired' : `close_${event.code}`
      scheduleReconnect(reason)
    }
  } catch (err) {
    connecting = false
    const message = err instanceof Error ? err.message : String(err)
    setStatus('error', message)
    scheduleReconnect('negotiate_failed')
  }
}

function ensureTopicEntry(topic: WsTopic) {
  let entry = topicEntries.get(topic)
  if (!entry) {
    entry = { handlers: new Set(), deniedHandlers: new Set() }
    topicEntries.set(topic, entry)
  }
  return entry
}

function scheduleIdleClose() {
  if (idleCloseTimer) return
  idleCloseTimer = setTimeout(() => {
    idleCloseTimer = null
    if (hasActiveSubscriptions()) return
    forceReconnect('no_active_topics')
  }, IDLE_CLOSE_GRACE_MS)
}

export function subscribeWsTopic<T = unknown>(
  topics: WsTopic[],
  handler: TopicHandler<T>,
  options: { onDenied?: DeniedHandler } = {}
) {
  if (!browser || !isEnabled()) return () => {}

  ensureContextWatchers()
  cancelIdleClose()

  const newOnWire: WsTopic[] = []
  const wrapped = handler as TopicHandler

  for (const topic of topics) {
    const entry = ensureTopicEntry(topic)
    const wasEmpty = entry.handlers.size === 0
    entry.handlers.add(wrapped)
    if (options.onDenied) entry.deniedHandlers.add(options.onDenied)
    if (wasEmpty) newOnWire.push(topic)
  }

  if (!ws || ws.readyState === WebSocket.CLOSED) {
    void openConnection()
  } else if (ws.readyState === WebSocket.OPEN && newOnWire.length > 0) {
    sendFrame({ op: 'subscribe', topics: newOnWire, id: nextCorrelationId() })
  }

  return () => {
    const dropOnWire: WsTopic[] = []
    for (const topic of topics) {
      const entry = topicEntries.get(topic)
      if (!entry) continue
      entry.handlers.delete(wrapped)
      if (options.onDenied) entry.deniedHandlers.delete(options.onDenied)
      if (entry.handlers.size === 0) {
        dropOnWire.push(topic)
        topicEntries.delete(topic)
      }
    }

    if (dropOnWire.length > 0 && ws?.readyState === WebSocket.OPEN) {
      sendFrame({ op: 'unsubscribe', topics: dropOnWire, id: nextCorrelationId() })
    }
    if (!hasActiveSubscriptions()) scheduleIdleClose()
  }
}

// src/lib/stores/mqtt.ts
// Singleton MQTT client + topic subscription helpers.
// Browser-only (mqtt.js v5 ships a browser bundle that targets WebSocket).
// Ported from klynx app/plugins/mqtt.client.ts + composables/useMqttTopic.ts.

import { browser } from '$app/environment'
import { env } from '$env/dynamic/public'
import { writable, derived, get } from 'svelte/store'
import type { MqttClient } from 'mqtt'

export type MqttStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error' | 'closed'
export type MqttConfig = {
  url?: string
  username?: string
  password?: string
  source?: 'runtime' | 'PUBLIC_MQTT_URL' | 'NUXT_PUBLIC_MQTT_URL'
  authSource?: 'runtime' | 'PUBLIC_MQTT' | 'NUXT_PUBLIC_MQTT'
}

export type MessageHandler = (topic: string, payload: Uint8Array) => void

const _status = writable<MqttStatus>('idle')
const _lastError = writable<string>('')

export const mqttStatus = { subscribe: _status.subscribe }
export const mqttLastError = { subscribe: _lastError.subscribe }
export const mqttConnected = derived(_status, ($s) => $s === 'connected')

let client: MqttClient | null = null
let connectingPromise: Promise<MqttClient | null> | null = null
let runtimeUrlOverride: string | undefined
let runtimeUsernameOverride: string | undefined
let runtimePasswordOverride: string | undefined
let configGeneration = 0

const dynamicPublicEnv = env as Record<string, string | undefined>
const vitePublicEnv = import.meta.env as Record<string, string | undefined>

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function firstPublicEnv(publicKey: string, nuxtKey: string) {
  return cleanEnv(dynamicPublicEnv[publicKey]) ?? cleanEnv(vitePublicEnv[publicKey]) ?? cleanEnv(vitePublicEnv[nuxtKey])
}

function publicAuthSource() {
  const publicAuth =
    cleanEnv(dynamicPublicEnv.PUBLIC_MQTT_USERNAME) ??
    cleanEnv(vitePublicEnv.PUBLIC_MQTT_USERNAME) ??
    cleanEnv(dynamicPublicEnv.PUBLIC_MQTT_PASSWORD) ??
    cleanEnv(vitePublicEnv.PUBLIC_MQTT_PASSWORD)
  if (publicAuth) {
    return 'PUBLIC_MQTT' as const
  }
  const nuxtAuth = cleanEnv(vitePublicEnv.NUXT_PUBLIC_MQTT_USERNAME) ?? cleanEnv(vitePublicEnv.NUXT_PUBLIC_MQTT_PASSWORD)
  if (nuxtAuth) {
    return 'NUXT_PUBLIC_MQTT' as const
  }
  return undefined
}

export function normalizeMqttBrokerUrl(value: string): string {
  const trimmed = cleanEnv(value)
  if (!trimmed) return ''

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('MQTT URL must be a valid ws:// or wss:// URL')
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('MQTT URL must start with ws:// or wss://')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Do not put username/password in the MQTT URL')
  }

  return parsed.toString()
}

export function getMqttConfig(): MqttConfig {
  const runtimeUrl = runtimeUrlOverride
  const runtimeAuth = runtimeUsernameOverride || runtimePasswordOverride
  const publicUrl = cleanEnv(dynamicPublicEnv.PUBLIC_MQTT_URL) ?? cleanEnv(vitePublicEnv.PUBLIC_MQTT_URL)
  const nuxtUrl = cleanEnv(vitePublicEnv.NUXT_PUBLIC_MQTT_URL)
  const url = runtimeUrl ?? publicUrl ?? nuxtUrl

  return {
    url,
    username: runtimeAuth ? runtimeUsernameOverride : firstPublicEnv('PUBLIC_MQTT_USERNAME', 'NUXT_PUBLIC_MQTT_USERNAME'),
    password: runtimeAuth ? runtimePasswordOverride : firstPublicEnv('PUBLIC_MQTT_PASSWORD', 'NUXT_PUBLIC_MQTT_PASSWORD'),
    source: runtimeUrl ? 'runtime' : publicUrl ? 'PUBLIC_MQTT_URL' : nuxtUrl ? 'NUXT_PUBLIC_MQTT_URL' : undefined,
    authSource: runtimeAuth ? 'runtime' : publicAuthSource()
  }
}

export async function setMqttUrlOverride(url: string | undefined): Promise<void> {
  const next = url ? normalizeMqttBrokerUrl(url) : undefined
  if (runtimeUrlOverride === next) return
  runtimeUrlOverride = next
  await disconnectMqtt()
  _lastError.set('')
}

export async function setMqttAuthOverride(username: string | undefined, password: string | undefined): Promise<void> {
  const nextUsername = cleanEnv(username)
  const nextPassword = cleanEnv(password)
  if (runtimeUsernameOverride === nextUsername && runtimePasswordOverride === nextPassword) return
  runtimeUsernameOverride = nextUsername
  runtimePasswordOverride = nextPassword
  await disconnectMqtt()
  _lastError.set('')
}

/**
 * Get the singleton client, lazy-connecting on first call.
 * Returns null when called from SSR or env vars are missing.
 */
export async function getMqttClient(): Promise<MqttClient | null> {
  if (!browser) return null
  if (client) return client
  if (connectingPromise) return connectingPromise

  const config = getMqttConfig()
  const url = config.url
  if (!url) {
    console.warn('[mqtt] PUBLIC_MQTT_URL / NUXT_PUBLIC_MQTT_URL not set — skipping connect')
    return null
  }

  const generation = configGeneration
  connectingPromise = (async () => {
    try {
      _status.set('connecting')
      const mqtt = await import('mqtt')
      const c = mqtt.default.connect(url, {
        clientId: 'phibek-app_' + Math.random().toString(16).slice(2, 8),
        username: config.username,
        password: config.password,
        protocolVersion: 5,
        clean: true,
        keepalive: 30,
        reconnectPeriod: 5000,
        connectTimeout: 15_000,
        rejectUnauthorized: false
      })

      if (generation !== configGeneration) {
        c.end(true)
        return null
      }

      c.on('connect', () => {
        _status.set('connected')
        _lastError.set('')
      })
      c.on('reconnect', () => _status.set('reconnecting'))
      c.on('close', () => _status.set('closed'))
      c.on('offline', () => _status.set('offline'))
      c.on('end', () => _status.set('idle'))
      c.on('error', (e) => {
        _status.set('error')
        _lastError.set(e?.message ?? String(e))
      })

      client = c
      return c
    } finally {
      connectingPromise = null
    }
  })()

  return connectingPromise
}

/**
 * End the singleton client. Useful for tests + logout flow.
 */
export async function disconnectMqtt(): Promise<void> {
  configGeneration += 1
  connectingPromise = null
  if (!client) {
    _status.set('idle')
    return
  }
  const current = client
  client = null
  await new Promise<void>((resolve) => {
    current.end(false, {}, () => resolve())
  })
  _status.set('idle')
}

type Match = (pattern: string, topic: string) => boolean

const matchesTopic: Match = (pattern, topic) => {
  if (pattern === topic) return true
  if (pattern.endsWith('#')) return topic.startsWith(pattern.slice(0, -1))
  // single-level wildcard +
  const pp = pattern.split('/')
  const tp = topic.split('/')
  if (pp.length !== tp.length) return false
  return pp.every((seg, i) => seg === '+' || seg === tp[i])
}

/**
 * Subscribe to one or more topics with a handler.
 * Returns an `unsubscribe` function that cleans up the handler + topic subs
 * (only this caller's subscriptions; the singleton client stays open).
 */
export function subscribeMqtt(
  topics: string | string[],
  onMessage: MessageHandler
): () => void {
  if (!browser) return () => {}

  const list = Array.isArray(topics) ? topics : [topics]
  const subscribed = new Set<string>()

  const handler = (topic: string, payload: Uint8Array) => {
    if (list.some((p) => matchesTopic(p, topic))) {
      onMessage(topic, payload)
    }
  }

  let stopped = false

  ;(async () => {
    const c = await getMqttClient()
    if (!c || stopped) return
    c.on('message', handler)

    const subAll = () => {
      for (const t of list) {
        if (subscribed.has(t)) continue
        c.subscribe(t, (err) => {
          if (err) {
            console.error('[mqtt] subscribe error:', t, err)
          } else {
            subscribed.add(t)
          }
        })
      }
    }

    if (get(_status) === 'connected') subAll()
    else c.once('connect', subAll)
  })()

  return () => {
    stopped = true
    if (!client) return
    client.off('message', handler)
    for (const t of subscribed) {
      client.unsubscribe(t, (err) => {
        if (err) console.error('[mqtt] unsubscribe error:', t, err)
      })
    }
    subscribed.clear()
  }
}

/**
 * Convenience helper: decode UTF-8 payload as JSON. Returns undefined on parse failure.
 */
export function decodeJson<T = unknown>(payload: Uint8Array): T | undefined {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as T
  } catch {
    return undefined
  }
}

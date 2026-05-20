// src/lib/utils/streamUrl.ts
// Build and resolve media stream URLs (WebRTC / FLV / HLS) for klynx-api.
// Ported from klynx app/composables/useStreamUrl.ts.

import { browser } from '$app/environment'
import { env } from '$env/dynamic/public'
import { api, type ApiError } from '$lib/utils/fetch'
import { notify } from '$lib/stores/notify'
import type { Camera } from '$lib/api/devices'

export type DeviceId = string

export type CameraLocation = {
  id: DeviceId
  url?: string
}

export type PlaybackKind = 'flv' | 'webrtc'

export type CameraPlayback = {
  url: string
  kind: PlaybackKind
}

type WsNegotiateResponse = {
  code?: string
  status?: boolean
  message?: string
  details?: {
    ticket?: string
    wsUrl?: string
    expiresAt?: string
  }
}

const createdStreamUrlMap = new Map<DeviceId, string>()
const BASE_PATH = (env.PUBLIC_APP_BASE_PATH ?? '').replace(/\/+$/, '')

function getMediaOrigin(): string {
  if (!browser) return ''
  return window.location.origin
}

function withBasePrefix(pathOrUrl: string): string {
  const prefix = BASE_PATH === '/' ? '' : BASE_PATH
  return pathOrUrl.startsWith('/') ? `${prefix}${pathOrUrl}` : pathOrUrl
}

/**
 * Convert a relative `playUrl` from klynx-api into an absolute browser URL.
 * Always prepends `PUBLIC_APP_BASE_PATH` for paths starting with `/`.
 */
export function toAbsoluteMediaUrl(pathOrUrl: string): string {
  const origin = getMediaOrigin()
  if (!origin) return pathOrUrl
  return new URL(withBasePrefix(pathOrUrl), origin).toString()
}

function toAbsoluteWebSocketUrl(pathOrUrl: string): string {
  if (/^wss?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const absolute = toAbsoluteMediaUrl(pathOrUrl)
  return absolute.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')
}

/**
 * Backend-proxied FLV WSS URLs require a single-use realtime ticket on the
 * query string. See klynx-api/docs/contracts/camera-live-flv-proxy.md §5.1.
 */
export async function withWsTicket(pathOrUrl: string): Promise<string> {
  const response = await api<WsNegotiateResponse, Record<string, never>>('/ws/v1/negotiate', {
    method: 'POST',
    body: {}
  })
  const ticket = response.details?.ticket
  if (!ticket) throw new Error('ไม่สามารถขอ ticket สำหรับ FLV stream ได้')

  const url = new URL(toAbsoluteWebSocketUrl(pathOrUrl))
  url.searchParams.set('ticket', ticket)
  return url.toString()
}

/**
 * Build the WebRTC playback URL by camera id (klynx ZKT pattern).
 * Returns absolute URL ready for <video src> / WHIP/WHEP setup.
 */
export function buildWebRTCUrlByIdStrict(deviceId: DeviceId): string {
  const origin = getMediaOrigin()
  if (!origin) return ''
  const u = new URL(withBasePrefix('/media/index/api/webrtc'), origin)
  u.searchParams.set('app', 'live')
  u.searchParams.set('stream', String(deviceId))
  u.searchParams.set('type', 'play')
  return u.toString()
}

type LiveStreamResponse = {
  code?: string
  message?: string
  status?: boolean
  details?: {
    playUrl?: string
    streamId?: string
    ready?: boolean
  }
}

function maybeNotifyForbidden(err: unknown) {
  const e = err as ApiError | undefined
  if (e?.statusCode !== 403) return
  const msg = String((e.data as { message?: string } | undefined)?.message ?? '')
  if (!msg.includes("camera is not in caller's allowed set")) return
  notify.error(
    'ไม่มีสิทธิ์ stream กล้องนี้',
    'Permission profile ปัจจุบันไม่ครอบคลุมกล้องนี้ — ติดต่อ admin เพื่อขอสิทธิ์'
  )
}

/**
 * Create (or fetch existing) stream URL for a camera.
 * - Default `apiPath` = `/media/stream` (biDash flow)
 * - `/live/stream` for klynx /live page
 *
 * The function GETs the stream id first, falling back to POST + WebRTC URL
 * construction when the stream is not yet provisioned. Mirrors klynx logic.
 */
export async function createStream(
  location: CameraLocation,
  apiPath = '/media/stream'
): Promise<string | null> {
  if (!location?.id) return null

  try {
    const resp = await api<LiveStreamResponse>(
      `${apiPath}/${encodeURIComponent(String(location.id))}`
    )
    const playUrl = String(resp?.details?.playUrl ?? '').trim()
    if (playUrl) {
      const absolute = toAbsoluteMediaUrl(playUrl)
      createdStreamUrlMap.set(location.id, absolute)
      return absolute
    }
  } catch (err) {
    maybeNotifyForbidden(err)
    console.warn(`[streamUrl] ${apiPath} GET fallback to POST:`, err)
  }

  if (!location.url) return null

  try {
    await api(apiPath, {
      method: 'POST',
      body: { stream: location.id, url: location.url }
    })
  } catch (err) {
    maybeNotifyForbidden(err)
    console.error('[streamUrl] createStream POST error:', err)
    return null
  }

  const url = buildWebRTCUrlByIdStrict(location.id)
  createdStreamUrlMap.set(location.id, url)
  return url
}

export function getCreatedStreamUrl(deviceId: DeviceId): string | null {
  return createdStreamUrlMap.get(deviceId) ?? null
}

function trimUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function hasFlvPlayback(camera: Pick<Camera, 'wssFlvUrl' | 'ataWsFlvUrl' | 'brand'>) {
  return Boolean(trimUrl(camera.wssFlvUrl) || trimUrl(camera.ataWsFlvUrl) || String(camera.brand ?? '').toUpperCase() === 'ATA')
}

export async function resolveCameraPlayback(camera: Camera, id: DeviceId): Promise<CameraPlayback | null> {
  const wssFlvUrl = trimUrl(camera.wssFlvUrl)
  if (wssFlvUrl) {
    return { url: await withWsTicket(wssFlvUrl), kind: 'flv' }
  }

  const legacyFlvUrl = trimUrl(camera.ataWsFlvUrl)
  if (legacyFlvUrl) {
    return { url: legacyFlvUrl, kind: 'flv' }
  }

  const webRtcUrl = await createStream({ id, url: camera.url ?? camera.streamUrl })
  return webRtcUrl ? { url: webRtcUrl, kind: 'webrtc' } : null
}

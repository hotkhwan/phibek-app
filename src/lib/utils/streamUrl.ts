// src/lib/utils/streamUrl.ts
// Build and resolve media stream URLs (WebRTC / FLV / HLS) for klynx-api.
// Ported from klynx app/composables/useStreamUrl.ts.

import { browser } from '$app/environment'
import { env } from '$env/dynamic/public'
import { api, type ApiError } from '$lib/utils/fetch'
import { notify } from '$lib/stores/notify'

export type DeviceId = string

export type CameraLocation = {
  id: DeviceId
  url?: string
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

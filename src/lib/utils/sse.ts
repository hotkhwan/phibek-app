// src/lib/utils/sse.ts
// Browser-only Server-Sent Events helper, with auto-reconnect and JSON decoding.
// Ported from klynx app/composables/useSSE.ts.

import { browser } from '$app/environment'
import { auth } from '$lib/stores/auth'

export type SseHandlers<T = unknown> = {
  onMessage?: (data: T, ev: MessageEvent) => void
  onOpen?: () => void
  onError?: (ev: Event) => void
}

export type SseHandle = {
  close: () => void
  readonly source: EventSource | null
}

/**
 * Subscribe to an SSE stream with auto-Bearer + auto-X-Active-Org headers.
 * NOTE: standard `EventSource` does not support custom headers. We rely on
 * cookie auth (the `session_token` httpOnly cookie set by `/auth/session`),
 * so the API gateway must accept cookie auth on SSE endpoints.
 *
 * For endpoints that require Bearer in URL, pass it as a query string.
 */
export function subscribeSse<T = unknown>(
  url: string,
  handlers: SseHandlers<T> = {}
): SseHandle {
  if (!browser) {
    return { close: () => {}, source: null }
  }

  let source: EventSource | null = null
  let closed = false

  const open = () => {
    if (closed) return
    source = new EventSource(url, { withCredentials: true })
    source.onopen = () => handlers.onOpen?.()
    source.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as T
        handlers.onMessage?.(data, ev)
      } catch {
        handlers.onMessage?.(ev.data as T, ev)
      }
    }
    source.onerror = (ev) => {
      handlers.onError?.(ev)
      // EventSource auto-reconnects; nothing else to do.
    }
  }

  open()

  return {
    get source() {
      return source
    },
    close() {
      closed = true
      source?.close()
      source = null
    }
  }
}

/**
 * Build an SSE URL relative to the API base, with optional query params.
 * Adds `?token=` when explicitly requested (some BE endpoints need it).
 */
export function buildSseUrl(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: { withTokenQuery?: boolean } = {}
): string {
  const base = (env_PUBLIC_API_BASE_URL() || '').replace(/\/+$/, '')
  const u = new URL(
    path.startsWith('http') ? path : `${base}/${path.replace(/^\//, '')}`
  )
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    u.searchParams.set(k, String(v))
  }
  if (options.withTokenQuery) {
    const token = auth.get().user?.token
    if (token) u.searchParams.set('token', token)
  }
  return u.toString()
}

function env_PUBLIC_API_BASE_URL(): string {
  // Read from import.meta.env at call time (browser only).
  // Avoids importing $env at module load to keep bundlers happy.
  try {
    return (import.meta.env.PUBLIC_API_BASE_URL as string) ?? ''
  } catch {
    return ''
  }
}

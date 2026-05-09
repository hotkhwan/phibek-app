// src/lib/utils/fetch.ts
// API client — auto-injects Bearer token + X-Active-Org headers.
// Ported from klynx app/composables/useApi.ts.

import { browser } from '$app/environment'
import { env } from '$env/dynamic/public'
import { auth } from '$lib/stores/auth'
import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
import { get } from 'svelte/store'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiOptions<TBody = unknown> = {
  method?: HttpMethod
  params?: Record<string, unknown>
  body?: TBody
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Override default API base. */
  baseUrl?: string
  /** When true, skip Bearer token injection. */
  skipAuth?: boolean
  /** Override fetch (e.g. SvelteKit `event.fetch`). */
  fetch?: typeof fetch
}

export type ApiError = {
  statusCode?: number
  statusMessage?: string
  message: string
  data?: unknown
  url: string
}

const API_BASE = (env.PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '')

function buildUrl(path: string, params?: Record<string, unknown>, baseUrl?: string) {
  const isAbsolute = /^https?:\/\//i.test(path)
  const base = baseUrl !== undefined ? baseUrl.replace(/\/+$/, '') : API_BASE
  const finalUrl = isAbsolute
    ? path
    : `${base}/${path.replace(/^\//, '')}`

  if (!params) return finalUrl
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) {
      for (const item of v) search.append(k, String(item))
    } else {
      search.set(k, String(v))
    }
  }
  const qs = search.toString()
  return qs ? `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${qs}` : finalUrl
}

function getActiveOrgFromBrowser(): string | undefined {
  if (!browser) return undefined
  try {
    return get(activeWorkspaceId) || undefined
  } catch {
    return undefined
  }
}

function shouldSendBody(method: HttpMethod) {
  return method !== 'GET'
}

export async function api<TResponse = unknown, TBody = unknown>(
  path: string,
  options: ApiOptions<TBody> = {}
): Promise<TResponse> {
  const method = options.method ?? 'GET'
  const url = buildUrl(path, options.params, options.baseUrl)
  const fetchFn = options.fetch ?? fetch

  const token = options.skipAuth ? undefined : auth.get().user?.token
  const activeOrg = getActiveOrgFromBrowser()

  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body && shouldSendBody(method) && !isFormData
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeOrg ? { 'X-Active-Org': activeOrg } : {}),
    ...options.headers
  }

  let body: BodyInit | undefined
  if (options.body !== undefined && shouldSendBody(method)) {
    body = isFormData
      ? (options.body as unknown as FormData)
      : JSON.stringify(options.body)
  }

  let res: Response
  try {
    res = await fetchFn(url, {
      method,
      headers,
      body,
      signal: options.signal,
      credentials: 'include'
    })
  } catch (err) {
    const message = (err as Error)?.message ?? 'Network error'
    throw <ApiError>{ message, url }
  }

  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await res.json().catch(() => undefined) : undefined

  if (!res.ok) {
    const data = payload as { message?: string } | undefined
    throw <ApiError>{
      statusCode: res.status,
      statusMessage: res.statusText,
      message: data?.message || res.statusText || 'Request failed',
      data: payload,
      url
    }
  }

  return (payload ?? ({} as TResponse)) as TResponse
}

export async function apiSafe<TResponse = unknown, TBody = unknown>(
  path: string,
  options?: ApiOptions<TBody>
): Promise<{ data: TResponse | null; error: ApiError | null }> {
  try {
    const data = await api<TResponse, TBody>(path, options)
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err as ApiError }
  }
}

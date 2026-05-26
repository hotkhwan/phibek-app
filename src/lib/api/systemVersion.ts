// src/lib/api/systemVersion.ts
// BE version + service name — surfaced from klynx-api `/version` endpoint.
// Endpoint shape: `{ details: { service, version } }` (see klynx-api main.go).
import { apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type BackendVersion = {
  service: string
  version: string
}

export async function getBackendVersion() {
  return apiSafe<ApiEnvelope<BackendVersion>>('/version', { skipAuth: true })
}

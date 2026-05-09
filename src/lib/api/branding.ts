// src/lib/api/branding.ts
import { api } from '$lib/utils/fetch'
import type {
  PatchPlatformConfigReq,
  PlatformAssetVariant,
  PlatformConfig,
  UploadPlatformAssetResponse
} from '$lib/types/branding'

const ENDPOINT = '/system/configs/platform'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export async function getPlatformConfig(): Promise<PlatformConfig | null> {
  const r = await api<ApiEnvelope<PlatformConfig>>(ENDPOINT).catch((err) => {
    console.warn('[branding.get] failed', err)
    return null
  })
  return r?.details ?? null
}

export async function updatePlatformConfig(
  patch: PatchPlatformConfigReq
): Promise<PlatformConfig> {
  const r = await api<ApiEnvelope<PlatformConfig>>(ENDPOINT, {
    method: 'PATCH',
    body: patch
  })
  return r.details
}

export async function uploadPlatformAsset(
  variant: PlatformAssetVariant,
  file: File
): Promise<UploadPlatformAssetResponse> {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('variant', variant)
  const r = await api<ApiEnvelope<UploadPlatformAssetResponse>>(
    `${ENDPOINT}/assets`,
    {
      method: 'POST',
      body: fd as unknown as Record<string, unknown>
    }
  )
  return r.details
}

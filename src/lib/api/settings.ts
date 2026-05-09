// src/lib/api/settings.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import type { SystemSettings, BackupStatus, UpdateInfo } from '$lib/types/settings'
import type { ApiResponse } from '$lib/types/org'
import { guardAuth } from '$lib/api/authGuard'

const BASE = `${(PUBLIC_APP_BASE_PATH ?? '/aisom').replace(/\/$/, '')}/api`

async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...init?.headers
    },
    ...init
  })
  guardAuth(res)
  const json = await res.json()
  if (!res.ok) throw json
  return json as ApiResponse<T>
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const r = await apiFetch<SystemSettings>('/system/settings')
  if (!r.details) throw new Error('No settings data returned')
  return r.details
}

export async function updateSystemSettings(data: Partial<SystemSettings>): Promise<void> {
  await apiFetch('/system/settings', {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const r = await apiFetch<BackupStatus>('/system/backup/status')
  if (!r.details) throw new Error('No backup status returned')
  return r.details
}

export async function triggerBackup(): Promise<Blob> {
  const res = await fetch(`${BASE}/system/backup`, { method: 'POST' })
  guardAuth(res)
  if (!res.ok) {
    const json = await res.json()
    throw json
  }
  return res.blob()
}

export async function triggerRestore(file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/system/restore`, {
    method: 'POST',
    body: form
  })
  guardAuth(res)
  if (!res.ok) {
    const json = await res.json()
    throw json
  }
}

export async function getUpdateInfo(): Promise<UpdateInfo> {
  const r = await apiFetch<UpdateInfo>('/system/update')
  if (!r.details) throw new Error('No update info returned')
  return r.details
}

export async function applyUpdate(): Promise<void> {
  await apiFetch('/system/update/apply', { method: 'POST' })
}

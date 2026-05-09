// src/lib/api/profile.ts
import { api } from '$lib/utils/fetch'

const ENDPOINT = '/users/profile'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type UserProfile = {
  id: string
  username: string
  email: string
  firstName: string
  lastName: string
  avatar?: string
  locale?: 'en' | 'th'
  zoomLevel?: number
  lat?: number
  lng?: number
  perPage?: number
}

export type UpdateProfileBody = {
  firstName?: string
  lastName?: string
  locale?: 'en' | 'th'
  avatar?: string
  perPage?: number
}

export async function getProfile(): Promise<UserProfile | null> {
  const r = await api<ApiEnvelope<UserProfile>>(ENDPOINT).catch((err) => {
    console.warn('[profile.get] failed', err)
    return null
  })
  return r?.details ?? null
}

export async function updateProfile(body: UpdateProfileBody): Promise<UserProfile> {
  const r = await api<ApiEnvelope<UserProfile>>(ENDPOINT, {
    method: 'PATCH',
    body
  })
  return r.details
}

// src/lib/stores/activeOrg.ts
import { writable, derived } from 'svelte/store'
import type { Org } from '$lib/types/org'
import { updateOrg } from '$lib/api/org'

const STORAGE_KEY = 'activeOrgId'

function getStoredOrgId(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY)
}

function storeOrgId(id: string | null) {
  if (typeof localStorage === 'undefined') return
  if (id) {
    localStorage.setItem(STORAGE_KEY, id)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export const orgList = writable<Org[]>([])
export const activeOrgId = writable<string | null>(getStoredOrgId())

// Sync activeOrgId to localStorage whenever it changes
// Use start callback instead of module-level subscribe to avoid SSR memory leak
const activeOrgIdSynced = {
  ...activeOrgId,
  set(value: string | null) {
    activeOrgId.set(value)
    storeOrgId(value)
  },
  update(fn: (value: string | null) => string | null) {
    activeOrgId.update((current) => {
      const next = fn(current)
      storeOrgId(next)
      return next
    })
  }
}

export const activeOrg = derived(
  [orgList, activeOrgId],
  ([$orgList, $activeOrgId]) =>
    $orgList.find((o) => o.id === $activeOrgId) ?? null
)

export async function setActiveOrg(id: string | null) {
  if (id) {
    try {
      // Call PATCH /orgs/:id with isActive=true
      await updateOrg(id, { isActive: true })
    } catch (e) {
      console.error('Failed to set active org:', e)
      // Continue with local state update even if API fails
    }
  }
  activeOrgIdSynced.set(id)
}

export function setOrgList(orgs: Org[]) {
  orgList.set(orgs)
  // auto-select first org if none selected
  activeOrgIdSynced.update((current) => {
    if (!current && orgs.length > 0) return orgs[0].id
    // if current org no longer in list, reset
    if (current && !orgs.find((o) => o.id === current)) return orgs[0]?.id ?? null
    return current
  })
}

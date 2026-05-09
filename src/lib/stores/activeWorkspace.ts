// src/lib/stores/activeWorkspace.ts
import { writable, derived } from 'svelte/store'
import type { Workspace } from '$lib/types/workspace'

const STORAGE_KEY = 'activeWorkspaceId'
const LEGACY_KEY = 'activeOrgId'

function getStoredWorkspaceId(): string | null {
  if (typeof localStorage === 'undefined') return null
  // localStorage migration: ถ้ามี key เก่าให้ copy ค่า แล้วลบ key เก่า
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy) {
    localStorage.setItem(STORAGE_KEY, legacy)
    localStorage.removeItem(LEGACY_KEY)
    return legacy
  }
  return localStorage.getItem(STORAGE_KEY)
}

function storeWorkspaceId(id: string | null) {
  if (typeof localStorage === 'undefined') return
  if (id) {
    localStorage.setItem(STORAGE_KEY, id)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export const workspaceList = writable<Workspace[]>([])
export const activeWorkspaceId = writable<string | null>(getStoredWorkspaceId())

const activeWorkspaceIdSynced = {
  ...activeWorkspaceId,
  set(value: string | null) {
    activeWorkspaceId.set(value)
    storeWorkspaceId(value)
  },
  update(fn: (value: string | null) => string | null) {
    activeWorkspaceId.update((current) => {
      const next = fn(current)
      storeWorkspaceId(next)
      return next
    })
  }
}

export const activeWorkspace = derived(
  [workspaceList, activeWorkspaceId],
  ([$workspaceList, $activeWorkspaceId]) =>
    $workspaceList.find((w) => w.id === $activeWorkspaceId) ?? null
)

export async function setActiveWorkspace(id: string | null) {
  activeWorkspaceIdSynced.set(id)
}

export function setWorkspaceList(workspaces: Workspace[]) {
  workspaceList.set(workspaces)
  activeWorkspaceIdSynced.update((current) => {
    if (!current && workspaces.length > 0) return workspaces[0].id
    if (current && !workspaces.find((w) => w.id === current)) return workspaces[0]?.id ?? null
    return current
  })
}

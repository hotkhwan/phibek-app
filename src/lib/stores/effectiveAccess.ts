// src/lib/stores/effectiveAccess.ts
import { getEffectiveAccess, type EffectiveAccess } from '$lib/api/effectiveAccess'
import { get, writable } from 'svelte/store'

const defaultAccess: EffectiveAccess = {
  visibleMenuIds: [],
  platformCapabilities: {
    canCreateOrganization: false,
    canManageSettings: false,
    canManageSubscription: false
  },
  orgCapabilities: {
    canManageOrganization: false,
    canManageMembers: false,
    canManageOrgUnits: false,
    canManageMenuPermissions: false,
    canManageResourcePermissions: false
  }
}

type State = {
  access: EffectiveAccess
  isLoaded: boolean
  loadingOrgId: string | null
}

const _effectiveAccess = writable<State>({
  access: defaultAccess,
  isLoaded: false,
  loadingOrgId: null
})

export const effectiveAccess = {
  subscribe: _effectiveAccess.subscribe,

  async fetch(orgId: string) {
    if (!orgId) return
    const current = get(_effectiveAccess)
    if (current.isLoaded && current.loadingOrgId === orgId) return

    _effectiveAccess.update((s) => ({ ...s, isLoaded: false, loadingOrgId: orgId }))
    const { data, error } = await getEffectiveAccess(orgId)

    if (error || !data?.details) {
      console.error('[effectiveAccess] Fetch failed:', error?.message ?? 'missing details')
      _effectiveAccess.set({ access: defaultAccess, isLoaded: true, loadingOrgId: orgId })
      return
    }

    _effectiveAccess.set({ access: data.details, isLoaded: true, loadingOrgId: orgId })
  },

  reset() {
    _effectiveAccess.set({ access: defaultAccess, isLoaded: false, loadingOrgId: null })
  },

  canAccessMenu(menuId: string) {
    const state = get(_effectiveAccess)
    if (!state.isLoaded) return false
    return state.access.visibleMenuIds.includes(menuId)
  }
}

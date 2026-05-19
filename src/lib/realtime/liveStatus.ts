// src/lib/realtime/liveStatus.ts
import type { LiveStatus } from '$lib/stores/wsHub'

export function liveBadgeClass(status: LiveStatus) {
  if (status === 'on') return 'bg-success'
  if (status === 'reconnecting') return 'bg-warning text-dark'
  if (status === 'error') return 'bg-danger'
  return 'bg-secondary'
}

export function liveBadgeLabel(status: LiveStatus) {
  if (status === 'on') return 'LIVE'
  if (status === 'reconnecting') return 'Syncing'
  if (status === 'error') return 'WSS error'
  return 'REST'
}

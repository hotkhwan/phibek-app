// src/lib/stores/notify.ts
import { writable } from 'svelte/store'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export type Toast = {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  icon?: string
  timeoutMs?: number
}

const _toasts = writable<Toast[]>([])
let nextId = 1

function add(variant: ToastVariant, title: string, description?: string, opts: Partial<Toast> = {}) {
  const id = nextId++
  const toast: Toast = {
    id,
    variant,
    title,
    description,
    icon: opts.icon,
    timeoutMs: opts.timeoutMs ?? 5000
  }
  _toasts.update((list) => [...list, toast])
  if (toast.timeoutMs && toast.timeoutMs > 0) {
    setTimeout(() => dismiss(id), toast.timeoutMs)
  }
  return id
}

export function dismiss(id: number) {
  _toasts.update((list) => list.filter((t) => t.id !== id))
}

export const toasts = { subscribe: _toasts.subscribe }

export const notify = {
  add,
  success: (title: string, description?: string, opts?: Partial<Toast>) =>
    add('success', title, description, opts),
  error: (title: string, description?: string, opts?: Partial<Toast>) =>
    add('error', title, description, opts),
  warning: (title: string, description?: string, opts?: Partial<Toast>) =>
    add('warning', title, description, opts),
  info: (title: string, description?: string, opts?: Partial<Toast>) =>
    add('info', title, description, opts),
  dismiss
}

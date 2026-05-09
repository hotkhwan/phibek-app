// src/lib/stores/branding.ts
import { browser } from '$app/environment'
import { writable } from 'svelte/store'
import { getPlatformConfig } from '$lib/api/branding'
import type { PlatformConfig } from '$lib/types/branding'

const FALLBACK: PlatformConfig = {
  platformNameTh: 'พิเภท',
  platformNameEn: 'Phibek',
  logoLightUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  primaryColor: '#C9952A',
  defaultLocale: 'en',
  defaultTheme: 'auto',
  updatedAt: '1970-01-01T00:00:00Z'
}

function normalizeBranding(cfg: PlatformConfig | null): PlatformConfig {
  const next = { ...FALLBACK, ...(cfg ?? {}) }
  const en = next.platformNameEn?.trim()
  const th = next.platformNameTh?.trim()
  const primaryColor = next.primaryColor?.trim()

  return {
    ...next,
    platformNameEn:
      !en || en.toLowerCase() === 'klynx' || en === 'PHIBEK'
        ? FALLBACK.platformNameEn
        : en,
    platformNameTh:
      !th || th.toLowerCase() === 'klynx' || th === 'PHIBEK'
        ? FALLBACK.platformNameTh
        : th,
    primaryColor:
      !primaryColor || primaryColor.toLowerCase() === '#2563eb'
        ? FALLBACK.primaryColor
        : primaryColor
  }
}

export const branding = writable<PlatformConfig>({ ...FALLBACK })
export const brandingLoaded = writable(false)

let inFlight: Promise<PlatformConfig | null> | null = null

function applyToDom(cfg: PlatformConfig) {
  if (!browser) return
  document.documentElement.style.setProperty(
    '--color-brand-primary',
    cfg.primaryColor
  )
  if (cfg.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = cfg.faviconUrl
  }
}

export async function fetchBranding(force = false): Promise<PlatformConfig | null> {
  if (!force && inFlight) return inFlight
  inFlight = (async () => {
    try {
      const cfg = normalizeBranding(await getPlatformConfig())
      branding.set(cfg)
      applyToDom(cfg)
      brandingLoaded.set(true)
      return cfg
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function setBranding(cfg: PlatformConfig) {
  branding.set(cfg)
  applyToDom(cfg)
  brandingLoaded.set(true)
}

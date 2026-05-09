export type ThemeMode = 'light' | 'dark' | 'auto'

const THEME_KEY = 'appThemeMode'
const COVER_KEY = 'appThemeCover'
const validModes = ['light', 'dark', 'auto'] as const
const LEGACY_DEFAULT_COVERS = new Set([
  '/img/logo/PhibekBG_dark.png',
  '/img/logo/PhibekBG_light.png',
  '/phibek/img/logo/PhibekBG_dark.png',
  '/phibek/img/logo/PhibekBG_light.png'
])
const PHIBEK_DEFAULT_COVER_PATTERN = /\/img\/logo\/PhibekBG_(dark|light)\.webp$/

type ValidThemeMode = (typeof validModes)[number]

export function normalizeThemeMode(value: string | null): ValidThemeMode {
  if (value && validModes.includes(value as ValidThemeMode)) {
    return value as ValidThemeMode
  }
  return 'auto'
}

export function applyTheme(mode: ValidThemeMode): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (mode === 'auto') {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    html.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light')
  } else {
    html.setAttribute('data-bs-theme', mode)
  }
}

export function initStoredTheme(): void {
  if (typeof localStorage === 'undefined') return
  const stored = normalizeThemeMode(localStorage.getItem(THEME_KEY))
  applyTheme(stored)
  const storedCover = normalizeStoredThemeCover(localStorage.getItem(COVER_KEY))
  if (!storedCover) localStorage.removeItem(COVER_KEY)
  applyThemeCover(storedCover)
}

/**
 * Default cover follows the current `data-bs-theme` value: dark uses the
 * PHIBEK Navy backdrop, light uses the cream variant. Per Brand Guideline.
 */
export function defaultThemeCover(): string {
  if (typeof document === 'undefined') return '/img/logo/PhibekBG_dark.webp'
  const isLight = document.documentElement.getAttribute('data-bs-theme') === 'light'
  return isLight
    ? '/img/logo/PhibekBG_light.webp'
    : '/img/logo/PhibekBG_dark.webp'
}

export function applyThemeCover(path: string | null): void {
  if (typeof document === 'undefined') return
  const url = path || defaultThemeCover()
  document.documentElement.style.setProperty(
    '--app-cover-image',
    `url('${url}')`
  )
}

export function normalizeStoredThemeCover(path: string | null): string | null {
  if (!path || LEGACY_DEFAULT_COVERS.has(path)) return null
  if (!PHIBEK_DEFAULT_COVER_PATTERN.test(path)) return null
  return path
}

export function saveThemeCover(path: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(COVER_KEY, path)
  }
  applyThemeCover(path)
}

export function resetThemeCover(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(COVER_KEY)
  }
  applyThemeCover(null)
}

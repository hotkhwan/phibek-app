// src/lib/i18nClient/setLanguage.ts
import { browser } from '$app/environment'
import { writable } from 'svelte/store'
import * as runtime from '$lib/i18n/runtime'

export type AppLocale = 'en' | 'th'

const storageKey = 'appLocale'

function normalizeLocale(value: string | null | undefined): AppLocale {
    return value === 'th' ? 'th' : 'en'
}

function getRuntimeSetLocale(): ((locale: string) => void) | null {
    if ('setLocale' in runtime && typeof (runtime as any).setLocale === 'function') {
        return (runtime as any).setLocale
    }
    return null
}

export function getStoredLocale(): AppLocale {
    if (!browser) return 'en'
    return normalizeLocale(localStorage.getItem(storageKey))
}

export function setStoredLocale(locale: AppLocale) {
    if (!browser) return
    localStorage.setItem(storageKey, locale)
}

export const currentLocaleStore = writable<AppLocale>('en')

export function initLocale() {
    if (!browser) return

    const locale = getStoredLocale()
    const setLocale = getRuntimeSetLocale()
    if (setLocale) setLocale(locale)

    currentLocaleStore.set(locale)
}

export function changeLocale(locale: AppLocale) {
    if (!browser) return

    setStoredLocale(locale)
    const setLocale = getRuntimeSetLocale()
    if (setLocale) setLocale(locale)

    currentLocaleStore.set(locale)
}

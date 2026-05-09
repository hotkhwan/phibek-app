// src/lib/utils/asset.ts
export type AssetHelper = (path: string) => string

export function asset(path: string): string {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

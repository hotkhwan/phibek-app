// src/lib/types/branding.ts
export type PlatformAssetVariant = 'light' | 'dark' | 'favicon'

export interface PlatformConfig {
  platformNameTh: string
  platformNameEn: string
  logoLightUrl: string | null
  logoDarkUrl: string | null
  faviconUrl: string | null
  primaryColor: string
  defaultLocale: 'en' | 'th'
  defaultTheme: 'auto' | 'light' | 'dark'
  updatedAt: string
}

export interface PatchPlatformConfigReq {
  platformNameTh?: string
  platformNameEn?: string
  primaryColor?: string
  defaultLocale?: 'en' | 'th'
  defaultTheme?: 'auto' | 'light' | 'dark'
}

export interface UploadPlatformAssetResponse {
  variant: PlatformAssetVariant
  url: string
}

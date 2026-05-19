// src/app.d.ts
/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

declare global {
  namespace App {
    interface Locals {
      user: null | {
        sub: string
        email?: string
        name?: string
        roles: string[]
        permissions?: string[]
        platformRole?: string
        accessToken?: string
      }
    }
  }

  namespace SvelteKit {
    interface Platform {}
  }

  interface ImportMetaEnv {
    readonly PUBLIC_APP_BASE_PATH?: string
    readonly PUBLIC_APP_BASE_PORT?: string
    readonly PUBLIC_REALTIME_HUB_ENABLED?: string
    readonly PUBLIC_MQTT_URL?: string
    readonly PUBLIC_MQTT_USERNAME?: string
    readonly PUBLIC_MQTT_PASSWORD?: string
    readonly NUXT_PUBLIC_MQTT_URL?: string
    readonly NUXT_PUBLIC_MQTT_USERNAME?: string
    readonly NUXT_PUBLIC_MQTT_PASSWORD?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  const __APP_VERSION__: string
}

export { }

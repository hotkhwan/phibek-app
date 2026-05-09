<!-- src/lib/components/shared/WebRTCPlayer.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { env } from '$env/dynamic/public'

  type ZlmEndpointInstance = {
    on: (event: string, cb: (...args: unknown[]) => void) => void
    close?: () => void
  }
  type ZlmRTCClient = {
    Endpoint: new (config: Record<string, unknown>) => ZlmEndpointInstance
    Events: { WEBRTC_ON_REMOTE_STREAMS: string; WEBRTC_ON_CONNECT: string; WEBRTC_OFFER_ANWSER_EXCHANGE_FAILED: string }
  }

  type ErrorPayload = Record<string, unknown>
  let {
    class: className = '',
    muted = true,
    autoplay = true,
    onError = (_p: ErrorPayload) => {}
  } = $props<{
    class?: string
    muted?: boolean
    autoplay?: boolean
    onError?: (payload: ErrorPayload) => void
  }>()

  let videoEl: HTMLVideoElement | null = $state(null)
  let errorMsg = $state('')
  let player: ZlmEndpointInstance | null = null

  const BASE = (env.PUBLIC_APP_BASE_PATH ?? '').replace(/\/+$/, '')
  const prefix = BASE === '/' ? '' : BASE
  const ZLM_SRC = `${prefix}/js/ZLMRTCClient.js`

  function hasZlm(w: Window): w is Window & { ZLMRTCClient: ZlmRTCClient } {
    return typeof (w as unknown as { ZLMRTCClient?: unknown }).ZLMRTCClient !== 'undefined'
  }

  function loadZlm(): Promise<ZlmRTCClient> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('window not available'))
        return
      }
      if (hasZlm(window)) {
        resolve(window.ZLMRTCClient)
        return
      }
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${ZLM_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', () => {
          if (hasZlm(window)) resolve(window.ZLMRTCClient)
          else reject(new Error('ZLMRTCClient missing on window'))
        })
        existing.addEventListener('error', () => reject(new Error('failed to load ZLMRTCClient.js')))
        return
      }
      const script = document.createElement('script')
      script.src = ZLM_SRC
      script.async = true
      script.onload = () => {
        if (hasZlm(window)) resolve(window.ZLMRTCClient)
        else reject(new Error('ZLMRTCClient missing on window'))
      }
      script.onerror = () => reject(new Error('failed to load ZLMRTCClient.js'))
      document.body.appendChild(script)
    })
  }

  function destroyPlayer() {
    try {
      player?.close?.()
    } catch (e) {
      console.warn('[WebRTCPlayer] close error', e)
    }
    player = null
  }

  export async function start(url: string) {
    if (!videoEl) {
      console.warn('[WebRTCPlayer] video element not ready')
      return
    }
    errorMsg = ''
    try {
      const Zlm = await loadZlm()
      destroyPlayer()
      player = new Zlm.Endpoint({
        element: videoEl,
        autoplay,
        debug: false,
        zlmsdpUrl: url,
        simulcast: false,
        useCamera: false,
        audioEnable: !muted,
        videoEnable: true,
        recvOnly: true
      })
      player.on(Zlm.Events.WEBRTC_OFFER_ANWSER_EXCHANGE_FAILED, (info) => {
        const payload = (info ?? {}) as ErrorPayload
        errorMsg = String((payload as { msg?: string }).msg ?? 'WebRTC SDP exchange failed')
        try { onError(payload) } catch { /* noop */ }
      })
    } catch (err) {
      errorMsg = (err as Error)?.message ?? 'WebRTC init failed'
      try { onError({ message: errorMsg }) } catch { /* noop */ }
    }
  }

  export function stop() {
    destroyPlayer()
  }

  onDestroy(() => destroyPlayer())
</script>

<div class="webrtc-player position-relative {className}" style="width: 100%; height: 100%;">
  <video
    bind:this={videoEl}
    {autoplay}
    {muted}
    playsinline
    style="width: 100%; height: 100%; display: block; background: #000;"
  ></video>
  {#if errorMsg}
    <div class="position-absolute top-50 start-50 translate-middle text-danger small bg-dark px-2 py-1 rounded">
      {errorMsg}
    </div>
  {/if}
</div>

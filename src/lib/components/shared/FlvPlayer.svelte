<!-- src/lib/components/shared/FlvPlayer.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte'

  type FlvPlayerInstance = {
    attachMediaElement: (el: HTMLMediaElement) => void
    load: () => void
    play: () => Promise<void> | void
    pause: () => void
    unload: () => void
    detachMediaElement: () => void
    destroy: () => void
    on: (event: string, cb: (...args: unknown[]) => void) => void
  }
  type FlvNamespace = {
    isSupported: () => boolean
    createPlayer: (
      mediaSource: { type: string; isLive?: boolean; url: string },
      config?: Record<string, unknown>
    ) => FlvPlayerInstance
    Events: { ERROR: string }
  }

  let { class: className = '', muted = true, autoplay = true } = $props<{
    class?: string
    muted?: boolean
    autoplay?: boolean
  }>()

  let videoEl: HTMLVideoElement | null = $state(null)
  let flvNs: FlvNamespace | null = null
  let flvPlayer: FlvPlayerInstance | null = null

  async function ensureFlv(): Promise<FlvNamespace | null> {
    if (typeof window === 'undefined') return null
    if (flvNs) return flvNs
    const mod = await import('flv.js')
    flvNs = ((mod as unknown as { default?: FlvNamespace }).default ?? mod) as FlvNamespace
    return flvNs
  }

  function destroyPlayer() {
    try {
      if (flvPlayer) {
        flvPlayer.pause()
        flvPlayer.unload()
        flvPlayer.detachMediaElement()
        flvPlayer.destroy()
      }
    } catch (e) {
      console.warn('[FlvPlayer] destroy error', e)
    } finally {
      flvPlayer = null
    }
  }

  export async function start(url: string) {
    const flv = await ensureFlv()
    if (!flv) return
    if (!flv.isSupported()) {
      console.error('[FlvPlayer] FLV not supported in this browser')
      throw new Error('FLV not supported')
    }
    if (!videoEl) {
      console.warn('[FlvPlayer] video element not ready')
      return
    }

    destroyPlayer()

    flvPlayer = flv.createPlayer(
      { type: 'flv', isLive: true, url },
      {
        isLive: true,
        enableStashBuffer: false,
        autoCleanupSourceBuffer: true,
        stashInitialSize: 128
      }
    )
    flvPlayer.attachMediaElement(videoEl)
    flvPlayer.load()
    try {
      await flvPlayer.play()
    } catch (err) {
      console.error('[FlvPlayer] play error', err)
    }
    flvPlayer.on(flv.Events.ERROR, (errType, errDetail) => {
      console.error('[FlvPlayer] error:', errType, errDetail)
    })
  }

  export function stop() {
    destroyPlayer()
  }

  onDestroy(() => destroyPlayer())
</script>

<video
  bind:this={videoEl}
  class={className}
  {autoplay}
  {muted}
  playsinline
  style="width: 100%; height: 100%; display: block; background: #000;"
></video>

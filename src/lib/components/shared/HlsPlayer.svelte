<!-- src/lib/components/shared/HlsPlayer.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type Hls from 'hls.js'

  let {
    source,
    class: className = '',
    autoplay = true,
    muted = true,
    controls = true
  } = $props<{
    source: string
    class?: string
    autoplay?: boolean
    muted?: boolean
    controls?: boolean
  }>()

  let videoEl: HTMLVideoElement | null = $state(null)
  let hls: Hls | null = null

  async function init() {
    if (typeof window === 'undefined' || !videoEl || !source) return
    const HlsMod = (await import('hls.js')).default
    if (HlsMod.isSupported()) {
      hls = new HlsMod()
      hls.loadSource(source)
      hls.attachMedia(videoEl)
      hls.on(HlsMod.Events.MANIFEST_PARSED, () => {
        if (autoplay) videoEl?.play().catch((err) => console.warn('[HlsPlayer] autoplay blocked', err))
      })
      hls.on(HlsMod.Events.ERROR, (_e, data) => {
        if (data.fatal) console.error('[HlsPlayer] fatal error', data)
      })
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = source
      videoEl.addEventListener('canplay', () => {
        if (autoplay) videoEl?.play().catch(() => {})
      })
    } else {
      console.error('[HlsPlayer] HLS not supported in this browser')
    }
  }

  function teardown() {
    try {
      hls?.destroy()
    } catch (e) {
      console.warn('[HlsPlayer] destroy error', e)
    }
    hls = null
  }

  onMount(init)
  onDestroy(teardown)

  $effect(() => {
    if (source && hls) {
      teardown()
      init()
    }
  })
</script>

<video
  bind:this={videoEl}
  class={className}
  {autoplay}
  {muted}
  {controls}
  playsinline
  style="width: 100%; height: 100%; display: block; background: #000;"
></video>

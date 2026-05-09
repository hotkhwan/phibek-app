<!-- src/lib/components/shared/VideoPlayer.svelte
     Auto-detects stream kind by URL suffix and delegates to FlvPlayer / HlsPlayer / WebRTCPlayer.
     Use directly when you don't know the format up-front. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import FlvPlayer from './FlvPlayer.svelte'
  import HlsPlayer from './HlsPlayer.svelte'
  import WebRTCPlayer from './WebRTCPlayer.svelte'

  let {
    source,
    kind,
    class: className = '',
    autoplay = true,
    muted = true,
    controls = false
  } = $props<{
    source: string
    kind?: 'flv' | 'hls' | 'webrtc'
    class?: string
    autoplay?: boolean
    muted?: boolean
    controls?: boolean
  }>()

  function detectKind(url: string): 'flv' | 'hls' | 'webrtc' {
    if (/\.flv(\?|$)/i.test(url)) return 'flv'
    if (/\.m3u8(\?|$)/i.test(url)) return 'hls'
    if (/webrtc|whep|whip/i.test(url)) return 'webrtc'
    return 'webrtc'
  }

  const resolvedKind = $derived(kind ?? detectKind(source))

  let flvRef: { start: (u: string) => void; stop: () => void } | null = $state(null)
  let webrtcRef: { start: (u: string) => void; stop: () => void } | null = $state(null)

  onMount(() => {
    queueMicrotask(() => {
      if (resolvedKind === 'flv') flvRef?.start(source)
      else if (resolvedKind === 'webrtc') webrtcRef?.start(source)
    })
  })
</script>

{#if resolvedKind === 'hls'}
  <HlsPlayer {source} class={className} {autoplay} {muted} {controls} />
{:else if resolvedKind === 'flv'}
  <FlvPlayer bind:this={flvRef} class={className} {autoplay} {muted} />
{:else}
  <WebRTCPlayer bind:this={webrtcRef} class={className} {autoplay} {muted} />
{/if}

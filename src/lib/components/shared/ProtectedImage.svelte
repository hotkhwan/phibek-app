<script lang="ts">
  import { onDestroy } from 'svelte'
  import { env } from '$env/dynamic/public'
  import { get } from 'svelte/store'
  import { auth } from '$lib/stores/auth'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'

  type Props = {
    src: string
    alt?: string
    class?: string
    bbox?: {
      width?: number
      height?: number
      x?: number
      y?: number
      w?: number
      h?: number
      x1?: number
      y1?: number
      x2?: number
      y2?: number
    } | null
  }

  let { src, alt = '', class: className = '', bbox = null }: Props = $props()
  let objectUrl = $state('')
  let failed = $state(false)
  let naturalWidth = $state(0)
  let naturalHeight = $state(0)
  let currentUrl = ''
  let lastRequested = ''
  let abortController: AbortController | null = null
  const failedUrls = new Set<string>()

  const overlaySpace = $derived.by(() => {
    if (!bbox || !naturalWidth || !naturalHeight) return null
    const bw = Number(bbox.width)
    const bh = Number(bbox.height)
    return {
      width: Number.isFinite(bw) && bw > 0 ? bw : naturalWidth,
      height: Number.isFinite(bh) && bh > 0 ? bh : naturalHeight
    }
  })

  const overlayBox = $derived.by(() => {
    if (!bbox || !overlaySpace) return null
    const rawX = Number(bbox.x)
    const rawY = Number(bbox.y)
    const rawW = Number(bbox.w ?? bbox.width)
    const rawH = Number(bbox.h ?? bbox.height)
    const values = Number.isFinite(rawX) && Number.isFinite(rawY) && Number.isFinite(rawW) && Number.isFinite(rawH)
      ? [rawX, rawY, rawX + rawW, rawY + rawH]
      : [bbox.x1, bbox.y1, bbox.x2, bbox.y2].map(Number)
    if (values.some((value) => !Number.isFinite(value))) return null
    const [rawX1, rawY1, rawX2, rawY2] = values
    const normalized = Math.max(Math.abs(rawX1), Math.abs(rawY1), Math.abs(rawX2), Math.abs(rawY2)) <= 1
    const scaleX = normalized ? overlaySpace.width : 1
    const scaleY = normalized ? overlaySpace.height : 1
    const x1 = Math.max(0, Math.min(overlaySpace.width, rawX1 * scaleX))
    const y1 = Math.max(0, Math.min(overlaySpace.height, rawY1 * scaleY))
    const x2 = Math.max(0, Math.min(overlaySpace.width, rawX2 * scaleX))
    const y2 = Math.max(0, Math.min(overlaySpace.height, rawY2 * scaleY))
    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    return {
      x,
      y,
      width: Math.max(2, Math.abs(x2 - x1)),
      height: Math.max(2, Math.abs(y2 - y1))
    }
  })

  const apiBase = (env.PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '')

  function fullUrl(value: string) {
    if (/^(blob|data|https?):/i.test(value)) return value
    if (value.startsWith('/api/v1/')) return value
    if (value.startsWith('api/v1/')) return `/${value}`
    if (value.startsWith('/kapi/files/')) return value.replace(/^\/kapi\/files/, '/api/v1/files')
    if (value.startsWith('/files/')) return `/api/v1${value}`
    if (value.startsWith('files/')) return `/api/v1/${value}`
    if (value.startsWith('canonical/')) return `/api/v1/files/${value.split('/').map(encodeURIComponent).join('/')}`
    return `${apiBase}/${value.replace(/^\//, '')}`
  }

  async function load(value: string) {
    failed = false
    abortController?.abort()
    abortController = null
    if (objectUrl && objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
    objectUrl = ''
    naturalWidth = 0
    naturalHeight = 0
    currentUrl = value
    if (!value) return

    if (/^(blob|data):/i.test(value)) {
      objectUrl = value
      return
    }

    const url = fullUrl(value)
    if (failedUrls.has(url)) {
      failed = true
      return
    }

    try {
      const token = auth.get().user?.token
      const activeOrg = get(activeWorkspaceId)
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      if (activeOrg) headers['X-Active-Org'] = activeOrg

      abortController = new AbortController()
      const res = await fetch(url, { headers, credentials: 'include', signal: abortController.signal })
      if (!res.ok || currentUrl !== value) {
        failedUrls.add(url)
        failed = true
        return
      }
      objectUrl = URL.createObjectURL(await res.blob())
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      failedUrls.add(url)
      failed = true
    }
  }

  $effect(() => {
    const nextSrc = src
    if (nextSrc === lastRequested) return
    lastRequested = nextSrc
    queueMicrotask(() => load(nextSrc))
  })

  onDestroy(() => {
    abortController?.abort()
    if (objectUrl && objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
  })
</script>

{#if objectUrl && !failed}
  {#if bbox}
    <div class="protected-image-frame {className}">
      <img
        src={objectUrl}
        {alt}
        class="protected-image-media"
        onload={(event) => {
          const image = event.currentTarget as HTMLImageElement
          naturalWidth = image.naturalWidth
          naturalHeight = image.naturalHeight
        }}
      />
      {#if overlayBox}
        <svg
          class="protected-image-overlay"
          viewBox="0 0 {overlaySpace?.width ?? naturalWidth} {overlaySpace?.height ?? naturalHeight}"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <rect class="protected-image-bbox-halo" x={overlayBox.x} y={overlayBox.y} width={overlayBox.width} height={overlayBox.height} />
          <rect class="protected-image-bbox" x={overlayBox.x} y={overlayBox.y} width={overlayBox.width} height={overlayBox.height} />
        </svg>
      {/if}
    </div>
  {:else}
    <img src={objectUrl} {alt} class={className} />
  {/if}
{:else}
  <div class={className} aria-label={alt}></div>
{/if}

<style lang="scss">
  .protected-image-frame {
    position: relative;
    display: block;
    overflow: hidden;
  }

  .protected-image-media {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .protected-image-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .protected-image-bbox-halo,
  .protected-image-bbox {
    fill: transparent;
    vector-effect: non-scaling-stroke;
  }

  .protected-image-bbox-halo {
    stroke: rgba(0, 0, 0, .82);
    stroke-width: 7;
  }

  .protected-image-bbox {
    stroke: #00ff9d;
    stroke-width: 3;
    filter: drop-shadow(0 0 8px rgba(0, 255, 157, .65));
  }
</style>

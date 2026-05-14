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
  }

  let { src, alt = '', class: className = '' }: Props = $props()
  let objectUrl = $state('')
  let failed = $state(false)
  let currentUrl = ''
  let lastRequested = ''
  let abortController: AbortController | null = null
  const failedUrls = new Set<string>()

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
  <img src={objectUrl} {alt} class={className} />
{:else}
  <div class={className} aria-label={alt}></div>
{/if}

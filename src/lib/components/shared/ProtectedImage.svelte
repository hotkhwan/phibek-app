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

  const apiBase = (env.PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '')

  function fullUrl(value: string) {
    if (/^(blob|data|https?):/i.test(value)) return value
    if (value.startsWith('/api/v1/')) return value
    return `${apiBase}/${value.replace(/^\//, '')}`
  }

  async function load(value: string) {
    failed = false
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = ''
    currentUrl = value
    if (!value) return

    if (/^(blob|data):/i.test(value)) {
      objectUrl = value
      return
    }

    try {
      const token = auth.get().user?.token
      const activeOrg = get(activeWorkspaceId)
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      if (activeOrg) headers['X-Active-Org'] = activeOrg

      const res = await fetch(fullUrl(value), { headers, credentials: 'include' })
      if (!res.ok || currentUrl !== value) {
        failed = true
        return
      }
      objectUrl = URL.createObjectURL(await res.blob())
    } catch {
      failed = true
    }
  }

  $effect(() => {
    load(src)
  })

  onDestroy(() => {
    if (objectUrl && objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
  })
</script>

{#if objectUrl && !failed}
  <img src={objectUrl} {alt} class={className} />
{:else}
  <div class={className} aria-label={alt}></div>
{/if}

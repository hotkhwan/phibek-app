<!-- src/routes/(public)/docs/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { m } from '$lib/i18n/messages'

  onMount(() => setPageTitle(m.navDocs()))

  const sections = [
    {
      title: 'Getting Started',
      items: [
        { slug: 'getting-started/install', label: 'Installation' },
        { slug: 'getting-started/first-org', label: 'Create your first organization' },
        { slug: 'getting-started/keycloak', label: 'Keycloak SSO setup' }
      ]
    },
    {
      title: 'AI Search',
      items: [
        { slug: 'aiSearch/overview', label: 'Overview' },
        { slug: 'aiSearch/chat-history', label: 'Chat history' }
      ]
    },
    {
      title: 'IoT Control',
      items: [
        { slug: 'iotControl/sensors', label: 'Sensor registry' },
        { slug: 'iotControl/alarms', label: 'Alarm acknowledgement & SOP' },
        { slug: 'iotControl/mqtt-topics', label: 'MQTT topics reference' }
      ]
    },
    {
      title: 'API',
      items: [
        { slug: 'api/auth', label: 'Authentication' },
        { slug: 'api/events', label: 'Events API' },
        { slug: 'api/webhooks', label: 'Webhooks & delivery targets' }
      ]
    }
  ]
</script>

<div class="container py-5">
  <h1 class="display-5 fw-bold mb-1" style="color: var(--phibek-foresight-gold);">{m.navDocs()}</h1>
  <p class="text-body text-opacity-50 mb-5">Operator and developer documentation for PHIBEK · พิเภท.</p>

  <div class="row g-3">
    {#each sections as s}
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header fw-bold">{s.title}</div>
          <div class="card-body">
            <ul class="list-unstyled mb-0">
              {#each s.items as it}
                <li class="mb-2">
                  <a href={`/docs/${it.slug}`} class="text-decoration-none link-body-emphasis">
                    <i class="bi bi-chevron-right small me-1 text-theme"></i>{it.label}
                  </a>
                </li>
              {/each}
            </ul>
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

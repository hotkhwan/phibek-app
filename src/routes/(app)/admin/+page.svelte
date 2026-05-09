<!-- src/routes/(app)/admin/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { m } from '$lib/i18n/messages'

  onMount(() => setPageTitle(m.navAdmin()))

  const cards = [
    {
      title: m.navAdminLicenses(),
      desc: 'Issue, list, and revoke per-customer license keys.',
      href: '/admin/licenses',
      icon: 'bi-key'
    },
    {
      title: m.navAdminPlatformLicense(),
      desc: 'Activate the platform license + view edition / expiry.',
      href: '/admin/platform-license',
      icon: 'bi-patch-check'
    }
  ]
</script>

<DomainStarter title={m.navAdmin()} subtitle="Platform admin — root-level operations" icon="bi-speedometer" legacyName="admin">
  <div class="row g-3">
    {#each cards as c}
      <div class="col-md-6">
        <a href={c.href} class="text-decoration-none text-body">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex align-items-center mb-2">
                <i class="bi {c.icon} fs-3 text-theme me-2"></i>
                <h5 class="fw-bold mb-0">{c.title}</h5>
              </div>
              <p class="text-body text-opacity-75 mb-0">{c.desc}</p>
            </div>
            <div class="card-arrow">
              <div class="card-arrow-top-left"></div>
              <div class="card-arrow-top-right"></div>
              <div class="card-arrow-bottom-left"></div>
              <div class="card-arrow-bottom-right"></div>
            </div>
          </div>
        </a>
      </div>
    {/each}
  </div>
</DomainStarter>

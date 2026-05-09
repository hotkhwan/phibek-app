<!-- src/routes/(app)/subscription/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { getCurrentSubscription, type CurrentSubscription } from '$lib/api/klynxSubscription'
  import { m } from '$lib/i18n/messages'

  let sub = $state<CurrentSubscription | null>(null)
  let loading = $state(false)
  let errorMsg = $state('')

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await getCurrentSubscription()
    loading = false
    if (error) errorMsg = error.message
    sub = data?.details ?? null
  }

  function pct(used: number | undefined, limit: number | undefined): number {
    if (!limit || !used) return 0
    return Math.min(100, Math.round((used / limit) * 100))
  }

  onMount(() => {
    setPageTitle(m.navSubscription())
    load()
  })
</script>

<DomainStarter title={m.navSubscription()} subtitle="Current plan, usage, and billing cycle" icon="bi-gem" legacyName="subscription">
  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  {#if loading}
    <div class="text-body text-opacity-50"><div class="spinner-border spinner-border-sm me-2"></div>Loading…</div>
  {:else if !sub}
    <div class="alert alert-warning small">No active subscription.</div>
  {:else}
    <div class="row g-3">
      <div class="col-lg-5">
        <div class="card h-100">
          <div class="card-header fw-bold">Plan</div>
          <div class="card-body">
            <div class="d-flex align-items-baseline gap-2 mb-2">
              <span class="display-6 fw-bold text-theme">{sub.planName ?? sub.planCode}</span>
              {#if sub.status}
                <span class="badge bg-{sub.status === 'active' ? 'success' : 'warning'}">{sub.status}</span>
              {/if}
            </div>
            <dl class="row mb-0">
              <dt class="col-sm-5 fw-semibold">Billing cycle</dt>
              <dd class="col-sm-7 mb-2">{sub.billingCycle ?? '—'}</dd>
              <dt class="col-sm-5 fw-semibold">Renews</dt>
              <dd class="col-sm-7 mb-0">
                {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
              </dd>
            </dl>
            <a href="/pricing" class="btn btn-outline-theme btn-sm mt-3">
              <i class="bi bi-arrow-up-circle me-1"></i> Change plan
            </a>
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      </div>

      <div class="col-lg-7">
        <div class="card h-100">
          <div class="card-header fw-bold">Usage vs limits</div>
          <div class="card-body">
            {#each [
              { label: 'Events / sec', used: sub.usage?.eventsPerSec, limit: sub.limits?.eventsPerSec },
              { label: 'Cameras', used: sub.usage?.cameras, limit: sub.limits?.cameras },
              { label: 'Storage (GB)', used: sub.usage?.storageGb, limit: sub.limits?.storageGb }
            ] as row}
              <div class="mb-3">
                <div class="d-flex justify-content-between small">
                  <span class="fw-semibold">{row.label}</span>
                  <span class="text-body text-opacity-75">{(row.used ?? 0).toLocaleString()} / {(row.limit ?? 0).toLocaleString()}</span>
                </div>
                <div class="progress" style="height: 8px;">
                  <div class="progress-bar bg-theme" style={`width: ${pct(row.used, row.limit)}%;`}></div>
                </div>
              </div>
            {/each}
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</DomainStarter>

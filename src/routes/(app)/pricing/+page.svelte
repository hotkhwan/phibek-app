<!-- src/routes/(app)/pricing/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { listPackages, startCheckout, type SubscriptionPlan } from '$lib/api/klynxSubscription'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  let plans = $state<SubscriptionPlan[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let cycle = $state<'monthly' | 'yearly'>('monthly')
  let busyCode = $state<string | null>(null)

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listPackages()
    loading = false
    if (error) errorMsg = error.message
    plans = data?.details?.items ?? []
  }

  async function choose(plan: SubscriptionPlan) {
    busyCode = plan.code
    try {
      const r = await startCheckout({ planCode: plan.code, cycle })
      if (r.details?.checkoutUrl) {
        window.location.assign(r.details.checkoutUrl)
      } else {
        notify.warning('Checkout', 'No checkoutUrl returned')
      }
    } catch (err) {
      notify.error('Checkout failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      busyCode = null
    }
  }

  onMount(() => {
    setPageTitle(m.navPricing())
    load()
  })
</script>

<DomainStarter title={m.navPricing()} subtitle="Pick a plan that fits your team" icon="bi-tag" legacyName="pricing">
  <div class="d-flex justify-content-end mb-3">
    <div class="btn-group btn-group-sm">
      <button type="button" class="btn"
        class:btn-theme={cycle === 'monthly'}
        class:btn-outline-theme={cycle !== 'monthly'}
        onclick={() => (cycle = 'monthly')}>Monthly</button>
      <button type="button" class="btn"
        class:btn-theme={cycle === 'yearly'}
        class:btn-outline-theme={cycle !== 'yearly'}
        onclick={() => (cycle = 'yearly')}>Yearly</button>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  {#if loading && plans.length === 0}
    <div class="text-body text-opacity-50"><div class="spinner-border spinner-border-sm me-2"></div>Loading plans…</div>
  {:else if plans.length === 0}
    <div class="alert alert-info small">No plans available.</div>
  {:else}
    <div class="row g-3">
      {#each plans as p (p.code)}
        <div class="col-lg-3 col-md-6">
          <div class="card h-100" class:border-theme={p.recommended}>
            <div class="card-body d-flex flex-column">
              <div class="text-uppercase fw-bold small text-body text-opacity-50 mb-1 font-monospace">{p.code}</div>
              <h3 class="fw-bold mb-2">{p.name}</h3>
              <div class="display-6 fw-bold mb-1 text-theme">
                {((cycle === 'yearly' ? p.priceYearly : p.priceMonthly) ?? 0).toLocaleString()}
                <small class="h6 fw-semibold text-body text-opacity-50">
                  {p.currency ?? 'USD'} / {cycle === 'yearly' ? 'yr' : 'mo'}
                </small>
              </div>
              {#if p.description}
                <p class="text-body text-opacity-75 small mb-3">{p.description}</p>
              {/if}
              <ul class="list-unstyled small text-body text-opacity-75 mb-4 flex-1">
                {#each p.features ?? [] as f}
                  <li class="mb-1"><i class="bi bi-check2 text-theme me-1"></i>{f}</li>
                {/each}
              </ul>
              <button type="button"
                class="btn"
                class:btn-theme={p.recommended}
                class:btn-outline-theme={!p.recommended}
                disabled={busyCode === p.code}
                onclick={() => choose(p)}>
                {#if busyCode === p.code}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                Choose plan
              </button>
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
  {/if}
</DomainStarter>

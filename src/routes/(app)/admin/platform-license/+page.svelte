<!-- src/routes/(app)/admin/platform-license/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import {
    getPlatformLicense,
    activatePlatformLicense,
    validatePlatformLicense,
    type PlatformLicense
  } from '$lib/api/adminLicense'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  let license = $state<PlatformLicense | null>(null)
  let loading = $state(false)
  let errorMsg = $state('')

  let licenseKey = $state('')
  let activating = $state(false)
  let validating = $state(false)
  let validateResult = $state<{ valid: boolean; reason?: string } | null>(null)

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await getPlatformLicense()
    loading = false
    if (error) {
      errorMsg = error.message
      return
    }
    license = data?.details ?? null
  }

  async function onValidate() {
    if (!licenseKey) return
    validating = true
    validateResult = null
    try {
      const r = await validatePlatformLicense(licenseKey)
      validateResult = r.details
    } catch (e) {
      validateResult = { valid: false, reason: (e as { message?: string })?.message ?? 'Validation failed' }
    } finally {
      validating = false
    }
  }

  async function onActivate() {
    if (!licenseKey) return
    activating = true
    try {
      const r = await activatePlatformLicense(licenseKey)
      license = r.details
      notify.success('Platform license activated')
      licenseKey = ''
      validateResult = null
    } catch (e) {
      notify.error(
        'Activation failed',
        (e as { message?: string })?.message ?? 'Unknown error'
      )
    } finally {
      activating = false
    }
  }

  onMount(() => {
    setPageTitle(`${m.navAdmin()} · ${m.navAdminPlatformLicense()}`)
    load()
  })
</script>

<DomainStarter title={m.navAdminPlatformLicense()} subtitle="Activate / verify the deployment-wide license" icon="bi-patch-check" legacyName="admin/platform-license">
  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  <div class="row g-3">
    <div class="col-lg-7">
      <div class="card h-100">
        <div class="card-header fw-bold">Current license</div>
        <div class="card-body">
          {#if loading}
            <div class="text-body text-opacity-50"><div class="spinner-border spinner-border-sm me-2"></div>Loading…</div>
          {:else if !license || license.status === 'unactivated'}
            <div class="alert alert-warning small mb-0">
              No platform license is active. Use the activation panel on the right.
            </div>
          {:else}
            <dl class="row mb-0">
              <dt class="col-sm-4 fw-semibold">Edition</dt>
              <dd class="col-sm-8 mb-2">{license.edition ?? '—'}</dd>

              <dt class="col-sm-4 fw-semibold">Customer</dt>
              <dd class="col-sm-8 mb-2">{license.customerName ?? '—'}</dd>

              <dt class="col-sm-4 fw-semibold">Status</dt>
              <dd class="col-sm-8 mb-2">
                <span class="badge bg-{license.status === 'active' ? 'success' : 'warning'}">
                  {license.status ?? '—'}
                </span>
              </dd>

              <dt class="col-sm-4 fw-semibold">Activated</dt>
              <dd class="col-sm-8 mb-2">
                {license.activatedAt ? new Date(license.activatedAt).toLocaleString() : '—'}
              </dd>

              <dt class="col-sm-4 fw-semibold">Expires</dt>
              <dd class="col-sm-8 mb-2">
                {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—'}
              </dd>

              {#if license.features?.length}
                <dt class="col-sm-4 fw-semibold">Features</dt>
                <dd class="col-sm-8 mb-0">
                  {#each license.features as f}
                    <span class="badge bg-theme bg-opacity-25 text-theme me-1 mb-1">{f}</span>
                  {/each}
                </dd>
              {/if}
            </dl>
          {/if}
        </div>
        <div class="card-arrow">
          <div class="card-arrow-top-left"></div>
          <div class="card-arrow-top-right"></div>
          <div class="card-arrow-bottom-left"></div>
          <div class="card-arrow-bottom-right"></div>
        </div>
      </div>
    </div>

    <div class="col-lg-5">
      <div class="card h-100">
        <div class="card-header fw-bold">Activate / Validate</div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label" for="licenseKey">License Key</label>
            <textarea
              id="licenseKey"
              class="form-control font-monospace"
              rows="4"
              bind:value={licenseKey}
              placeholder="Paste signed key…"
            ></textarea>
          </div>

          {#if validateResult}
            <div class="alert alert-{validateResult.valid ? 'success' : 'danger'} small">
              {#if validateResult.valid}
                <i class="bi bi-check-circle me-1"></i> Key is valid
              {:else}
                <i class="bi bi-x-octagon me-1"></i> {validateResult.reason ?? 'Invalid key'}
              {/if}
            </div>
          {/if}

          <div class="d-flex gap-2">
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              disabled={!licenseKey || validating}
              onclick={onValidate}
            >
              {#if validating}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
              Validate
            </button>
            <button
              type="button"
              class="btn btn-outline-theme btn-sm"
              disabled={!licenseKey || activating}
              onclick={onActivate}
            >
              {#if activating}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
              Activate
            </button>
          </div>
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
</DomainStarter>

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

  let artifactText = $state('')
  let artifactFileName = $state('')
  let activating = $state(false)
  let validating = $state(false)
  let validateResult = $state<{ valid: boolean; reason?: string } | null>(null)
  let repairStatus = $state('')

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

  function parseArtifact() {
    const trimmed = artifactText.trim()
    if (!trimmed) throw new Error('artifact is required')
    return JSON.parse(trimmed) as unknown
  }

  async function onFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) {
      notify.warning('License artifact', 'Please choose a .json file.')
      input.value = ''
      return
    }
    artifactText = await file.text()
    artifactFileName = file.name
    validateResult = null
  }

  async function onValidate() {
    if (!artifactText.trim()) return
    validating = true
    validateResult = null
    try {
      const artifact = parseArtifact()
      const r = await validatePlatformLicense(artifact)
      validateResult = { valid: r.details?.valid ?? true, reason: r.details?.reason }
    } catch (e) {
      validateResult = { valid: false, reason: (e as { message?: string })?.message ?? 'Validation failed' }
    } finally {
      validating = false
    }
  }

  async function onActivate() {
    if (!artifactText.trim()) return
    activating = true
    try {
      const artifact = parseArtifact()
      const r = await activatePlatformLicense(artifact)
      license = r.details.platformLicense ?? r.details
      repairStatus = r.details.subscriptionRepair?.status ?? ''
      notify.success('Platform license activated')
      artifactText = ''
      artifactFileName = ''
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
            <label class="form-label" for="licenseArtifactFile">License artifact (.json)</label>
            <input
              id="licenseArtifactFile"
              class="form-control form-control-sm mb-2"
              type="file"
              accept="application/json,.json"
              onchange={onFileChange}
            />
            {#if artifactFileName}
              <div class="text-body text-opacity-50 small mb-2">{artifactFileName}</div>
            {/if}
            <label class="form-label" for="licenseArtifact">Signed artifact JSON</label>
            <textarea
              id="licenseArtifact"
              class="form-control font-monospace"
              rows="10"
              bind:value={artifactText}
              placeholder='Paste signed artifact JSON, or choose a .json file above…'
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
          {#if repairStatus}
            <div class="alert alert-info small">
              Subscription repair status: <b>{repairStatus}</b>
            </div>
          {/if}

          <div class="d-flex gap-2">
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              disabled={!artifactText.trim() || validating}
              onclick={onValidate}
            >
              {#if validating}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
              Validate
            </button>
            <button
              type="button"
              class="btn btn-outline-theme btn-sm"
              disabled={!artifactText.trim() || activating}
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

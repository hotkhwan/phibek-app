<!-- src/routes/(app)/admin/licenses/[licenseId]/+page.svelte
     License detail page — info / entitlement / audit log / artifact.
     Lifecycle actions (activate / suspend / terminate / renew) live on the
     list page (per PR #41) and are not duplicated here. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import {
    getAuditLog,
    getArtifact,
    getEntitlement,
    getLicense,
    issueArtifact,
    reissueArtifact,
    type Entitlement,
    type License,
    type LicenseArtifactDetails,
    type LicenseAuditEvent,
    type LicenseStatus
  } from '$lib/api/adminLicense'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  let license = $state<License | null>(null)
  let entitlement = $state<Entitlement | null>(null)
  let artifact = $state<LicenseArtifactDetails | null>(null)
  let artifactMissing = $state(false)
  let audit = $state<LicenseAuditEvent[]>([])
  let auditTotal = $state(0)
  let auditPage = $state(1)
  let auditPerPage = $state(10)
  let loading = $state(false)
  let auditLoading = $state(false)
  let artifactLoading = $state(false)
  let issuing = $state(false)
  let reissuing = $state(false)
  let errorMsg = $state('')
  let viewArtifactOpen = $state(false)

  const licenseId = $derived(page.params.licenseId ?? '')

  function badge(s: LicenseStatus | undefined): string {
    switch (s) {
      case 'active': return 'bg-success'
      case 'suspended': return 'bg-warning text-dark'
      case 'expired':
      case 'terminated':
      case 'revoked':
        return 'bg-danger'
      default:
        return 'bg-secondary'
    }
  }

  const canIssue = $derived(license?.status === 'active' && artifactMissing)
  const canReissue = $derived(license?.status !== 'terminated' && !!artifact)
  const canDownload = $derived(!!artifact)

  async function loadLicense() {
    loading = true
    errorMsg = ''
    const { data, error } = await getLicense(licenseId)
    loading = false
    if (error) {
      errorMsg = error.message
      return
    }
    license = data?.details ?? null
  }

  async function loadEntitlement() {
    const { data } = await getEntitlement(licenseId)
    entitlement = data?.details ?? null
  }

  async function loadArtifact() {
    artifactLoading = true
    const { data, error } = await getArtifact(licenseId)
    artifactLoading = false
    if (error?.statusCode === 404) {
      artifact = null
      artifactMissing = true
      return
    }
    if (error) {
      artifact = null
      artifactMissing = false
      return
    }
    artifact = data?.details ?? null
    artifactMissing = !artifact
  }

  async function loadAudit() {
    if (auditLoading) return
    auditLoading = true
    const { data, error } = await getAuditLog(licenseId, { page: auditPage, perPage: auditPerPage })
    auditLoading = false
    if (error) {
      audit = []
      auditTotal = 0
      return
    }
    audit = data?.details?.items ?? []
    auditTotal = data?.pagination?.totalRecords ?? audit.length
  }

  function triggerJsonDownload(payload: unknown, filename: string) {
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function issueNow() {
    if (issuing) return
    issuing = true
    try {
      const { data, error } = await issueArtifact(licenseId)
      if (error) throw new Error(error.message)
      artifact = data?.details ?? null
      artifactMissing = !artifact
      if (artifact) triggerJsonDownload(artifact, `license-${licenseId}.json`)
      notify.success('Issue artifact สำเร็จ', '')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('Issue ไม่สำเร็จ', msg)
    } finally {
      issuing = false
    }
  }

  async function reissueNow() {
    if (reissuing) return
    reissuing = true
    try {
      const { data, error } = await reissueArtifact(licenseId)
      if (error) throw new Error(error.message)
      artifact = data?.details ?? null
      artifactMissing = !artifact
      if (artifact) triggerJsonDownload(artifact, `license-${licenseId}.json`)
      notify.success('Reissue สำเร็จ', '')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('Reissue ไม่สำเร็จ', msg)
    } finally {
      reissuing = false
    }
  }

  function downloadArtifact() {
    if (!artifact) {
      notify.warning('ไม่มี artifact ให้ดาวน์โหลด', '')
      return
    }
    triggerJsonDownload(artifact, `license-${licenseId}.json`)
  }

  async function copyArtifact() {
    if (!artifact) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(artifact, null, 2))
      notify.success('คัดลอกลง clipboard แล้ว', '')
    } catch {
      notify.error('Clipboard ไม่พร้อมใช้งาน', '')
    }
  }

  function gotoAuditPage(p: number) {
    const totalPages = Math.max(1, Math.ceil(auditTotal / auditPerPage))
    if (p < 1 || p > totalPages || p === auditPage) return
    auditPage = p
    void loadAudit()
  }

  onMount(async () => {
    setPageTitle(`${m.navAdminLicenses()} · ${licenseId}`)
    await loadLicense()
    await Promise.all([loadEntitlement(), loadArtifact(), loadAudit()])
  })
</script>

<div class="page-shell">
  <a href="/admin/licenses" class="btn btn-link btn-sm p-0 mb-2">
    <i class="bi bi-chevron-left me-1"></i> All licenses
  </a>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  {#if loading && !license}
    <div class="text-center py-5 text-body text-opacity-50">
      <div class="spinner-border spinner-border-sm me-2"></div>Loading…
    </div>
  {:else if !license}
    <div class="alert alert-warning small">License not found.</div>
  {:else}
    <!-- Header card -->
    <div class="card mb-3">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div>
            <h1 class="page-header mb-1">
              <i class="bi bi-key text-theme me-2"></i>{license.customerName ?? 'License'}
            </h1>
            <div class="small text-body text-opacity-65 font-monospace">{license.licenseId ?? license.id}</div>
          </div>
          <span class="badge text-uppercase {badge(license.status)}">{license.status ?? '—'}</span>
        </div>

        <div class="row g-3 mt-2">
          <div class="col-md-3">
            <dt class="small fw-semibold text-body text-opacity-65">Plan</dt>
            <dd class="mb-0"><span class="badge bg-info text-dark text-uppercase">{license.plan ?? '—'}</span></dd>
          </div>
          <div class="col-md-3">
            <dt class="small fw-semibold text-body text-opacity-65">Seats</dt>
            <dd class="mb-0">{license.seats ?? '—'}</dd>
          </div>
          <div class="col-md-3">
            <dt class="small fw-semibold text-body text-opacity-65">Expires</dt>
            <dd class="mb-0">{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—'}</dd>
          </div>
          <div class="col-md-3">
            <dt class="small fw-semibold text-body text-opacity-65">Created</dt>
            <dd class="mb-0">{license.createdAt ? new Date(license.createdAt).toLocaleString() : '—'}</dd>
          </div>
          {#if license.deploymentType}
            <div class="col-md-3">
              <dt class="small fw-semibold text-body text-opacity-65">Deployment</dt>
              <dd class="mb-0 text-uppercase">{license.deploymentType}</dd>
            </div>
          {/if}
          {#if license.deliveryMode}
            <div class="col-md-3">
              <dt class="small fw-semibold text-body text-opacity-65">Delivery</dt>
              <dd class="mb-0 text-uppercase">{license.deliveryMode}</dd>
            </div>
          {/if}
          {#if license.customerOrgId}
            <div class="col-md-6">
              <dt class="small fw-semibold text-body text-opacity-65">Customer org id</dt>
              <dd class="mb-0 small font-monospace">{license.customerOrgId}</dd>
            </div>
          {/if}
        </div>
      </div>
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>

    <div class="row g-3">
      <!-- Artifact -->
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header fw-bold d-flex justify-content-between align-items-center">
            <span><i class="bi bi-file-earmark-lock me-1"></i> Signed artifact</span>
            {#if artifactLoading}<span class="spinner-border spinner-border-sm"></span>{/if}
          </div>
          <div class="card-body">
            {#if artifact}
              <dl class="small mb-3">
                <dt class="fw-semibold">Key ID</dt>
                <dd class="font-monospace text-body text-opacity-75 mb-2">{artifact.keyId ?? '—'}</dd>
                <dt class="fw-semibold">Version</dt>
                <dd class="mb-2">{artifact.version ?? '—'}</dd>
                {#if artifact.issuedAt}
                  <dt class="fw-semibold">Issued</dt>
                  <dd class="mb-2">{new Date(artifact.issuedAt).toLocaleString()}</dd>
                {/if}
                {#if artifact.reissuedAt}
                  <dt class="fw-semibold">Last reissue</dt>
                  <dd class="mb-2">{new Date(artifact.reissuedAt).toLocaleString()}</dd>
                {/if}
                <dt class="fw-semibold">Signature</dt>
                <dd class="font-monospace text-body text-opacity-75 mb-0 text-truncate" title={artifact.signature ?? ''}>
                  {artifact.signature ? artifact.signature.slice(0, 32) + '…' : '—'}
                </dd>
              </dl>
            {:else if artifactMissing}
              <div class="alert alert-warning small mb-3">
                <i class="bi bi-info-circle me-1"></i> ยังไม่มี artifact — กด <strong>Issue</strong> เพื่อสร้างและ download
              </div>
            {:else}
              <div class="text-body text-opacity-50 small">Loading artifact…</div>
            {/if}

            <div class="d-flex flex-wrap gap-2">
              {#if canIssue}
                <button type="button" class="btn btn-theme btn-sm" onclick={issueNow} disabled={issuing}>
                  {#if issuing}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                  <i class="bi bi-file-earmark-arrow-up me-1"></i> Issue
                </button>
              {/if}
              {#if canReissue}
                <button type="button" class="btn btn-outline-theme btn-sm" onclick={reissueNow} disabled={reissuing}>
                  {#if reissuing}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                  <i class="bi bi-arrow-repeat me-1"></i> Reissue
                </button>
              {/if}
              {#if canDownload}
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={downloadArtifact}>
                  <i class="bi bi-download me-1"></i> Download .json
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (viewArtifactOpen = true)}>
                  <i class="bi bi-eye me-1"></i> View JSON
                </button>
              {/if}
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

      <!-- Entitlement -->
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header fw-bold"><i class="bi bi-shield-check me-1"></i> Entitlement</div>
          <div class="card-body">
            {#if !entitlement}
              <div class="text-body text-opacity-50 small">Loading…</div>
            {:else}
              {#if entitlement.features?.length}
                <div class="mb-3">
                  <dt class="small fw-semibold text-body text-opacity-65">Features</dt>
                  <dd class="mb-0">
                    {#each entitlement.features as f}
                      <span class="badge bg-secondary me-1 mb-1">{f}</span>
                    {/each}
                  </dd>
                </div>
              {/if}
              {#if entitlement.limits && Object.keys(entitlement.limits).length > 0}
                <div class="mb-3">
                  <dt class="small fw-semibold text-body text-opacity-65 mb-1">Limits</dt>
                  <dl class="row small mb-0">
                    {#each Object.entries(entitlement.limits) as [k, v]}
                      <dt class="col-7 fw-normal text-body text-opacity-65">{k}</dt>
                      <dd class="col-5 text-end mb-1 font-monospace">{v}</dd>
                    {/each}
                  </dl>
                </div>
              {/if}
              {#if entitlement.validUntil}
                <div>
                  <dt class="small fw-semibold text-body text-opacity-65">Valid until</dt>
                  <dd class="mb-0">{new Date(entitlement.validUntil).toLocaleString()}</dd>
                </div>
              {/if}
              {#if !entitlement.features?.length && (!entitlement.limits || !Object.keys(entitlement.limits).length)}
                <div class="text-body text-opacity-50 small">ไม่มีข้อมูล entitlement</div>
              {/if}
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
    </div>

    <!-- Audit log -->
    <div class="card mt-3">
      <div class="card-header fw-bold d-flex justify-content-between align-items-center">
        <span><i class="bi bi-clock-history me-1"></i> Audit log</span>
        <div class="d-flex align-items-center gap-2">
          {#if auditLoading}<span class="spinner-border spinner-border-sm"></span>{/if}
          <select class="form-select form-select-sm" style="width: auto" bind:value={auditPerPage} onchange={() => { auditPage = 1; void loadAudit() }}>
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-striped table-sm table-card mb-0 align-middle small">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {#if audit.length === 0}
              <tr><td colspan="4" class="text-center py-3 text-uppercase text-body text-opacity-50">No audit events</td></tr>
            {:else}
              {#each audit as ev (ev.id)}
                <tr>
                  <td class="text-body text-opacity-75">{ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : '—'}</td>
                  <td><span class="badge bg-secondary text-uppercase">{ev.action ?? '—'}</span></td>
                  <td class="text-body text-opacity-75">{ev.actorName ?? ev.actor ?? '—'}</td>
                  <td class="text-body text-opacity-75">{ev.reason ?? '—'}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {#if auditTotal > auditPerPage}
        <div class="p-3 border-top">
          <ul class="pagination pagination-sm mb-0 justify-content-center">
            <li class="page-item" class:disabled={auditPage <= 1}>
              <button type="button" class="page-link" onclick={() => gotoAuditPage(auditPage - 1)} disabled={auditPage <= 1}>Previous</button>
            </li>
            <li class="page-item active"><span class="page-link">{auditPage}</span></li>
            <li class="page-item" class:disabled={auditPage * auditPerPage >= auditTotal}>
              <button type="button" class="page-link" onclick={() => gotoAuditPage(auditPage + 1)} disabled={auditPage * auditPerPage >= auditTotal}>Next</button>
            </li>
          </ul>
        </div>
      {/if}
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>
  {/if}
</div>

<!-- View Artifact JSON -->
<Modal bind:open={viewArtifactOpen} title="Artifact JSON" size="lg">
  {#snippet body()}
    {#if artifact}
      <pre class="artifact-json">{JSON.stringify(artifact, null, 2)}</pre>
    {:else}
      <div class="text-body text-opacity-50">No artifact loaded.</div>
    {/if}
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (viewArtifactOpen = false)}>Close</button>
    {#if artifact}
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={copyArtifact}>
        <i class="bi bi-clipboard me-1"></i> Copy
      </button>
      <button type="button" class="btn btn-theme btn-sm" onclick={downloadArtifact}>
        <i class="bi bi-download me-1"></i> Download
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  .page-shell { padding: 1rem; }
  .page-header { font-size: 1.4rem; font-weight: 700; }
  .artifact-json {
    max-height: 60vh;
    overflow: auto;
    padding: 1rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 6px;
    background: rgba(0, 0, 0, .35);
    color: rgba(255, 255, 255, .9);
    font-size: .76rem;
    line-height: 1.45;
  }
  :global([data-bs-theme="light"]) .artifact-json {
    background: rgba(15, 23, 42, .04);
    color: rgba(15, 23, 42, .85);
  }
</style>

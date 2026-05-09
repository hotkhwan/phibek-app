<!-- src/routes/(app)/settings/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { m } from '$lib/i18n/messages'
  import { branding, fetchBranding } from '$lib/stores/branding'
  import { notify } from '$lib/stores/notify'

  type SettingsTab = 'map-center' | 'providers' | 'streams' | 'branding'

  const tabs: {
    id: SettingsTab
    label: string
    icon: `bi bi-${string}`
  }[] = [
    { id: 'map-center', label: 'ศูนย์กลางแผนที่ระบบ', icon: 'bi bi-geo-alt' },
    { id: 'providers', label: 'ผู้ให้บริการแผนที่', icon: 'bi bi-map' },
    { id: 'streams', label: 'Stream Sessions', icon: 'bi bi-stopwatch' },
    { id: 'branding', label: 'Branding ของแพลตฟอร์ม', icon: 'bi bi-palette' }
  ]

  let activeTab = $state<SettingsTab>('map-center')
  let search = $state('')
  let latitude = $state('13.7563')
  let longitude = $state('100.5018')
  let zoom = $state('13')
  let provider = $state('Google Maps')
  let maxSessions = $state('48')
  let idleTimeout = $state('15')

  function saveSettings() {
    notify.success(m.settingsAppearanceSaved())
  }

  onMount(() => {
    setPageTitle(m.settingsTitle())
    fetchBranding()
  })
</script>

<div class="settings-shell">
  <div class="settings-header">
    <div class="d-flex align-items-center gap-3">
      <i class="bi bi-kanban fs-2 text-theme"></i>
      <div>
        <h1 class="page-header mb-0 fw-bold">{m.settingsTitle()}</h1>
        <div class="text-body text-opacity-50 small">{m.settingsSubtitle()}</div>
      </div>
    </div>
  </div>

  <div class="settings-tabs" role="tablist" aria-label={m.settingsTitle()}>
    {#each tabs as tab}
      <button
        type="button"
        class="settings-tab"
        class:active={activeTab === tab.id}
        onclick={() => (activeTab = tab.id)}
      >
        <i class={tab.icon}></i>
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>

  <div class="settings-content">
    {#if activeTab === 'map-center'}
      <section class="settings-section">
        <div class="d-flex align-items-start justify-content-between gap-3 mb-4">
          <div>
            <h2 class="h3 fw-bold mb-1">ศูนย์กลางแผนที่ทั้งระบบ</h2>
            <div class="text-body text-opacity-50">
              กำหนดตำแหน่งพิกัดกลางและระดับการซูมเริ่มต้นสำหรับทั้งระบบ
            </div>
          </div>
          <button type="button" class="btn btn-theme settings-save" onclick={saveSettings}>
            <i class="bi bi-floppy me-2"></i>บันทึกการตั้งค่าระบบ
          </button>
        </div>

        <div class="settings-form-panel mb-4">
          <div class="row g-3 align-items-end">
            <div class="col-lg-5">
              <label class="form-label fw-semibold" for="placeSearch">ค้นหาสถานที่</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input
                  id="placeSearch"
                  class="form-control"
                  placeholder="กรอกชื่อสถานที่หรือที่อยู่..."
                  bind:value={search}
                />
              </div>
            </div>
            <div class="col-sm-4 col-lg-2">
              <label class="form-label fw-semibold" for="latitude">ละติจูด</label>
              <input id="latitude" class="form-control" bind:value={latitude} />
            </div>
            <div class="col-sm-4 col-lg-2">
              <label class="form-label fw-semibold" for="longitude">ลองจิจูด</label>
              <input id="longitude" class="form-control" bind:value={longitude} />
            </div>
            <div class="col-sm-4 col-lg-2">
              <label class="form-label fw-semibold" for="zoom">ระดับซูม</label>
              <input id="zoom" class="form-control" bind:value={zoom} />
            </div>
          </div>
        </div>

        <div class="map-preview-frame">
          <div class="map-preview">
            <img src="/img/landing/mockup-8.jpg" alt="Bangkok map preview" />
            <div class="map-pin" aria-hidden="true">
              <i class="bi bi-geo-alt-fill"></i>
            </div>
            <div class="map-label">Bangkok<br /><span>กรุงเทพมหานคร</span></div>
            <div class="map-controls">
              <button type="button" aria-label="Zoom in"><i class="bi bi-plus"></i></button>
              <button type="button" aria-label="Zoom out"><i class="bi bi-dash"></i></button>
              <button type="button" aria-label="Fullscreen"><i class="bi bi-fullscreen"></i></button>
            </div>
          </div>
        </div>
      </section>
    {:else if activeTab === 'providers'}
      <section class="settings-section">
        <h2 class="h3 fw-bold mb-1">ผู้ให้บริการแผนที่</h2>
        <div class="text-body text-opacity-50 mb-4">เลือก provider หลักสำหรับแผนที่และ fallback ในระบบ</div>
        <div class="settings-form-panel">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold" for="provider">Provider หลัก</label>
              <select id="provider" class="form-select" bind:value={provider}>
                <option>Google Maps</option>
                <option>OpenStreetMap</option>
                <option>Mapbox</option>
              </select>
            </div>
            <div class="col-md-6 d-flex align-items-end">
              <button type="button" class="btn btn-theme" onclick={saveSettings}>
                <i class="bi bi-floppy me-2"></i>บันทึก
              </button>
            </div>
          </div>
        </div>
      </section>
    {:else if activeTab === 'streams'}
      <section class="settings-section">
        <h2 class="h3 fw-bold mb-1">Stream Sessions</h2>
        <div class="text-body text-opacity-50 mb-4">กำหนดขีดจำกัด session และ timeout เริ่มต้นของการสตรีม</div>
        <div class="settings-form-panel">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-semibold" for="maxSessions">Session สูงสุด</label>
              <input id="maxSessions" class="form-control" bind:value={maxSessions} />
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold" for="idleTimeout">Idle timeout (นาที)</label>
              <input id="idleTimeout" class="form-control" bind:value={idleTimeout} />
            </div>
            <div class="col-md-4 d-flex align-items-end">
              <button type="button" class="btn btn-theme" onclick={saveSettings}>
                <i class="bi bi-floppy me-2"></i>บันทึก
              </button>
            </div>
          </div>
        </div>
      </section>
    {:else}
      <section class="settings-section">
        <h2 class="h3 fw-bold mb-1">Branding ของแพลตฟอร์ม</h2>
        <div class="text-body text-opacity-50 mb-4">ตัวอย่างแบรนด์และสีหลักที่ใช้งานในระบบ Phibek</div>
        <div class="settings-brand-panel">
          <div class="d-flex align-items-center gap-3 mb-4">
            <div class="fs-1 text-theme"><i class="bi bi-eye"></i></div>
            <div>
              <div class="fs-3 fw-bold">{$branding.platformNameEn || 'Phibek'}</div>
              <div class="text-body text-opacity-50">{$branding.platformNameTh || 'พิเภท'}</div>
            </div>
          </div>
          <dl class="admin-detail-grid mb-0">
            <dt>{m.settingsSystemName()} (EN)</dt>
            <dd>{$branding.platformNameEn || 'Phibek'}</dd>
            <dt>{m.settingsSystemName()} (TH)</dt>
            <dd>{$branding.platformNameTh || 'พิเภท'}</dd>
            <dt>Primary Color</dt>
            <dd><code>{$branding.primaryColor || '#C9952A'}</code></dd>
          </dl>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .settings-shell {
    min-height: calc(100dvh - 6rem);
    padding: 0;
  }

  .settings-header {
    padding: 1.4rem 1.75rem;
    border-bottom: 1px solid rgba(var(--bs-body-color-rgb), .1);
    background: var(--phibek-surface-nested-bg, rgba(var(--bs-body-bg-rgb), .18));
    backdrop-filter: blur(10px);
  }

  .settings-tabs {
    display: flex;
    gap: 1.25rem;
    overflow-x: auto;
    padding: 0 1.75rem;
    border-bottom: 1px solid rgba(var(--bs-body-color-rgb), .1);
    background: var(--phibek-surface-nested-bg, rgba(var(--bs-body-bg-rgb), .14));
  }

  .settings-tab {
    min-height: 4.4rem;
    border: 0;
    border-bottom: 2px solid transparent;
    color: rgba(var(--bs-body-color-rgb), .55);
    background: transparent;
    display: inline-flex;
    align-items: center;
    gap: .55rem;
    white-space: nowrap;
    font-size: 1.02rem;
    font-weight: 700;
    padding: 0 .15rem;
  }

  .settings-tab i {
    font-size: 1.25rem;
  }

  .settings-tab.active {
    color: var(--bs-theme);
    border-bottom-color: var(--bs-theme);
  }

  .settings-content {
    max-width: 1320px;
    margin: 0 auto;
    padding: 3.2rem 1.75rem 4rem;
  }

  .settings-section {
    max-width: 1120px;
    margin: 0 auto;
  }

  .settings-save {
    min-width: 12rem;
  }

  .settings-form-panel,
  .settings-brand-panel {
    border: 1px solid rgba(var(--bs-body-color-rgb), .1);
    background: var(--phibek-surface-bg, rgba(var(--bs-body-bg-rgb), .24));
    padding: 2rem;
    border-radius: .5rem;
    backdrop-filter: blur(12px);
  }

  .map-preview-frame {
    border: 1px solid rgba(var(--bs-theme-rgb), .3);
    background: var(--phibek-surface-bg, rgba(var(--bs-body-bg-rgb), .24));
    padding: 2rem;
    border-radius: .5rem;
    backdrop-filter: blur(12px);
  }

  .map-preview {
    position: relative;
    min-height: 28rem;
    overflow: hidden;
    background: #e8edf4;
  }

  .map-preview img {
    width: 100%;
    height: 100%;
    min-height: 28rem;
    object-fit: cover;
    display: block;
    filter: saturate(.9) contrast(1.03);
  }

  .map-pin {
    position: absolute;
    left: 50%;
    top: 56%;
    transform: translate(-50%, -100%);
    color: #dc2626;
    font-size: 3rem;
    text-shadow: 0 3px 8px rgba(0, 0, 0, .28);
  }

  .map-label {
    position: absolute;
    left: 50%;
    top: 57%;
    transform: translateX(-50%);
    color: #172033;
    font-size: 2rem;
    line-height: 1.1;
    font-weight: 800;
    text-align: center;
    text-shadow: 0 1px 0 rgba(255, 255, 255, .8);
  }

  .map-label span {
    font-size: 1.7rem;
  }

  .map-controls {
    position: absolute;
    right: 1rem;
    top: 1rem;
    display: grid;
    gap: .4rem;
  }

  .map-controls button {
    width: 2.35rem;
    height: 2.35rem;
    border: 0;
    background: rgba(255, 255, 255, .9);
    color: #172033;
    box-shadow: 0 1px 5px rgba(0, 0, 0, .16);
  }

  @media (max-width: 767.98px) {
    .settings-header,
    .settings-tabs,
    .settings-content {
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .settings-content {
      padding-top: 1.5rem;
    }

    .settings-form-panel,
    .settings-brand-panel,
    .map-preview-frame {
      padding: 1rem;
    }

    .settings-save {
      min-width: auto;
    }

    .map-preview,
    .map-preview img {
      min-height: 20rem;
    }
  }
</style>

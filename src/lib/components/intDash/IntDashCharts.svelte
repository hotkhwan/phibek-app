<!-- src/lib/components/intDash/IntDashCharts.svelte -->
<script lang="ts">
  import ChartJs from '$lib/components/plugins/ChartJs.svelte'
  import type { IntDashDatasets } from '$lib/api/intDash'

  type Props = {
    datasets: IntDashDatasets
    loading?: boolean
  }

  let { datasets, loading = false }: Props = $props()

  const severityColors = {
    high: '#ef4444',
    medium: '#f97316',
    low: '#3b82f6',
    info: '#9ca3af',
    none: '#6b7280'
  }
  const severityLabels = {
    high: 'รุนแรง',
    medium: 'ปานกลาง',
    low: 'ต่ำ',
    info: 'ข้อมูล',
    none: 'ไม่ระบุ'
  }
  const categoryColors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ec4899', '#94a3b8']

  const hasTimelineData = $derived(
    Object.values(datasets.timeline.series).some((series) => series.some((n) => n > 0))
  )
  const hasTopDevicesData = $derived(datasets.topDevices.length > 0)
  const hasCameraHealthData = $derived(datasets.cameraHealth.online !== null || datasets.cameraHealth.offline !== null)
  const hasCategoriesData = $derived(datasets.categories.length > 0)

  function timeLabel(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  const baseScale = {
    ticks: { color: 'rgba(226, 232, 240, .72)', font: { size: 10 } },
    grid: { color: 'rgba(148, 163, 184, .16)' }
  }

  const timelineData = $derived({
    labels: datasets.timeline.buckets.map(timeLabel),
    datasets: (['high', 'medium', 'low', 'info', 'none'] as const)
      .filter((severity) => severity === 'high' || datasets.timeline.series[severity].some((n) => n > 0))
      .map((severity) => ({
        label: severityLabels[severity],
        data: datasets.timeline.series[severity],
        borderColor: severityColors[severity],
        backgroundColor: `${severityColors[severity]}33`,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2
      }))
  })

  const timelineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: { legend: { display: true, labels: { color: 'rgba(226, 232, 240, .76)', boxWidth: 10, font: { size: 10 } } } },
    scales: { x: baseScale, y: { ...baseScale, stacked: true, beginAtZero: true } }
  }

  const topDevicesData = $derived({
    labels: [...datasets.topDevices].reverse().map((item) => item.deviceName),
    datasets: [{
      label: 'เหตุการณ์',
      data: [...datasets.topDevices].reverse().map((item) => item.count),
      backgroundColor: '#3b82f6',
      borderRadius: 6,
      barThickness: 12
    }]
  })

  const topDevicesOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { ...baseScale, beginAtZero: true }, y: baseScale }
  }

  const cameraHealthData = $derived({
    labels: ['ออนไลน์', 'ออฟไลน์'],
    datasets: [{
      data: [datasets.cameraHealth.online ?? 0, datasets.cameraHealth.offline ?? 0],
      backgroundColor: ['#10b981', '#ef4444'],
      borderWidth: 0
    }]
  })

  const categoryData = $derived({
    labels: datasets.categories.map((item) => item.name),
    datasets: [{
      data: datasets.categories.map((item) => item.count),
      backgroundColor: datasets.categories.map((_, index) => categoryColors[index % categoryColors.length]),
      borderWidth: 0
    }]
  })

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    plugins: { legend: { display: true, position: 'bottom' as const, labels: { color: 'rgba(226, 232, 240, .72)', boxWidth: 10, font: { size: 10 } } } }
  }
</script>

<div class="intdash-chart-grid">
  <article class="intdash-widget">
    <header>
      <h3>เหตุการณ์ย้อนหลัง 60 นาที</h3>
      <span>5 นาที / จุด</span>
    </header>
    <div class="chart-box">
      {#if hasTimelineData}
        <ChartJs type="line" data={timelineData} options={timelineOptions} height={170} />
      {:else}
        <div class="empty-state">{loading ? 'กำลังโหลด...' : 'ยังไม่มีเหตุการณ์ในช่วงนี้'}</div>
      {/if}
    </div>
  </article>

  <article class="intdash-widget">
    <header>
      <h3>อุปกรณ์ที่รายงานมากที่สุด</h3>
      <span>Top 5</span>
    </header>
    <div class="chart-box">
      {#if hasTopDevicesData}
        <ChartJs type="bar" data={topDevicesData} options={topDevicesOptions} height={170} />
      {:else}
        <div class="empty-state">{loading ? 'กำลังโหลด...' : 'ยังไม่มีข้อมูล'}</div>
      {/if}
    </div>
  </article>

  <article class="intdash-widget">
    <header>
      <h3>สถานะกล้อง</h3>
      <span>ปัจจุบัน</span>
    </header>
    <div class="chart-box">
      {#if hasCameraHealthData}
        <ChartJs type="doughnut" data={cameraHealthData} options={donutOptions} height={170} />
      {:else}
        <div class="empty-state">{loading ? 'กำลังโหลด...' : '—'}</div>
      {/if}
    </div>
  </article>

  <article class="intdash-widget">
    <header>
      <h3>ประเภทเหตุการณ์</h3>
      <span>ตาม contract</span>
    </header>
    <div class="chart-box">
      {#if hasCategoriesData}
        <ChartJs type="doughnut" data={categoryData} options={donutOptions} height={170} />
      {:else}
        <div class="empty-state">{loading ? 'กำลังโหลด...' : 'ยังไม่มีข้อมูล'}</div>
      {/if}
    </div>
  </article>
</div>

<style>
  .intdash-chart-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
  }

  .intdash-widget {
    min-height: 236px;
    border: 1px solid rgba(148, 163, 184, .18);
    border-radius: 8px;
    background: rgba(8, 16, 24, .82);
    padding: 1rem;
    box-shadow: 0 16px 36px rgba(0, 0, 0, .16);
  }

  .intdash-widget header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: .75rem;
    min-height: 42px;
  }

  .intdash-widget h3 {
    margin: 0;
    color: rgba(248, 250, 252, .92);
    font-size: .95rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .intdash-widget header span {
    color: rgba(148, 163, 184, .86);
    font-size: .72rem;
    white-space: nowrap;
  }

  .chart-box {
    position: relative;
    height: 170px;
    min-height: 170px;
  }

  .empty-state {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: rgba(203, 213, 225, .64);
    font-size: .82rem;
  }

  :global([data-bs-theme="light"]) .intdash-widget {
    background: rgba(255, 255, 255, .92);
    border-color: rgba(15, 23, 42, .1);
  }

  :global([data-bs-theme="light"]) .intdash-widget h3 {
    color: rgba(15, 23, 42, .92);
  }

  :global([data-bs-theme="light"]) .empty-state {
    color: rgba(71, 85, 105, .74);
  }

  @media (max-width: 1199.98px) {
    .intdash-chart-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 767.98px) {
    .intdash-chart-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

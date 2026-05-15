<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'

  type StatusTile = {
    label: string
    value: string
    unit: string
    icon: string
    color: string
  }

  type SparkStat = {
    label: string
    value: string
    delta: string
    trend: 'up' | 'down'
    points: number[]
  }

  type Metric = {
    icon: string
    label: string
    value: string
    delta: string
    points: number[]
  }

  type Region = {
    label: string
    value: string
    progress: number
  }

  type Activity = {
    time: string
    event: string
    detail: string
    user: string
    status: string
    tone: 'success' | 'warning' | 'danger'
  }

  type DonutItem = {
    label: string
    value: string
    percent: string
    share: number
    color: string
  }

  const statusTiles: StatusTile[] = [
    { label: 'ACTIVE BACKUP', value: '12', unit: 'Systems', icon: 'bi-arrow-clockwise', color: '#2ef27d' },
    { label: 'ACTIVE FIREWALL', value: '24', unit: 'Nodes', icon: 'bi-shield-check', color: '#53a6ff' },
    { label: 'DETECTED THREAT', value: '7', unit: 'Alerts', icon: 'bi-radioactive', color: '#ff405a' },
    { label: 'PENDING SYNC', value: '18', unit: 'Tasks', icon: 'bi-cloud-arrow-up', color: '#ff9f1c' },
    { label: 'LOCKED DATA VAULT', value: '3', unit: 'Vaults', icon: 'bi-safe2', color: '#16d9e3' }
  ]

  const sideStats: SparkStat[] = [
    { label: 'PAGE VIEWS', value: '12,543', delta: '23.6%', trend: 'up', points: [12, 16, 18, 15, 24, 16, 20, 22, 29, 25, 34, 30, 42, 35, 44] },
    { label: 'AVG. SESSION DURATION', value: '02:34', delta: '18.7%', trend: 'up', points: [18, 19, 24, 20, 31, 21, 28, 30, 39, 33, 49, 36, 45, 41, 52] },
    { label: 'NEW VISITORS', value: '45.2%', delta: '9.8%', trend: 'up', points: [14, 15, 20, 17, 25, 18, 23, 27, 24, 35, 28, 44, 31, 39, 37] },
    { label: 'BOUNCE RATE', value: '32.6%', delta: '4.3%', trend: 'down', points: [42, 40, 35, 38, 31, 29, 33, 27, 23, 25, 18, 21, 16, 19, 14] },
    { label: 'TOP REFERRING SITES', value: 'Google', delta: '15.3%', trend: 'up', points: [18, 20, 17, 26, 21, 30, 24, 32, 28, 38, 34, 45, 39, 51, 47] },
    { label: 'COUNTRIES REACH', value: '87', delta: '12.1%', trend: 'up', points: [13, 16, 18, 15, 24, 19, 29, 23, 33, 29, 42, 36, 48, 41, 55] }
  ]

  const campaignBars = [
    38, 44, 51, 60, 66, 73, 80, 70, 58, 64, 76, 84, 70, 68, 66, 62, 55, 48,
    42, 39, 43, 46, 44, 37, 42, 48, 53, 33, 31, 36, 41, 43, 31, 38, 45, 52,
    58, 55, 46, 37, 31, 34, 40, 44, 49, 53, 48, 39, 32, 36, 42, 46, 51, 34,
    27, 24, 22, 25, 29, 26, 31, 28, 34, 43, 51, 59, 68, 72, 78, 84, 90, 76
  ]

  const campaignLine =
    '0,170 42,150 84,128 126,110 168,104 210,88 252,74 294,66 336,52 378,62 420,76 462,82 504,80 546,92 588,112 630,130 672,148 714,166 756,174 798,168 840,172 882,164 924,92 960,64'

  const campaignTicks = ['8 MAY', '9 MAY', '10 MAY', '11 MAY', '12 MAY', '13 MAY', '14 MAY', '15 MAY']

  const salesMetrics: Metric[] = [
    { icon: 'bi-currency-dollar', label: 'REVENUE', value: '$1.68M', delta: '24.8%', points: [22, 24, 25, 30, 26, 36, 28, 42, 34, 48, 39, 55] },
    { icon: 'bi-hdd-network', label: 'PROFIT', value: '$720K', delta: '18.9%', points: [16, 18, 20, 19, 25, 17, 30, 23, 35, 28, 38, 34] },
    { icon: 'bi-send', label: 'VISITS', value: '1.3M', delta: '17.5%', points: [12, 14, 16, 18, 15, 25, 17, 28, 21, 33, 24, 36] }
  ]

  const regions: Region[] = [
    { label: 'NORTH AMERICA REGION', value: '62%', progress: 62 },
    { label: 'EUROPE REGION', value: '38%', progress: 38 }
  ]

  const activityRows: Activity[] = [
    { time: '10:03:21', event: 'User Login', detail: 'Admin logged in from 192.168.1.10', user: 'admin', status: 'Success', tone: 'success' },
    { time: '10:02:15', event: 'Data Sync', detail: 'Sync data from edge node E-102', user: 'system', status: 'Success', tone: 'success' },
    { time: '10:01:08', event: 'Threat Detected', detail: 'Suspicious activity detected (High)', user: 'watchman', status: 'Warning', tone: 'warning' },
    { time: '10:00:44', event: 'Backup Completed', detail: 'Daily backup completed successfully', user: 'system', status: 'Success', tone: 'success' },
    { time: '09:59:32', event: 'Firewall Alert', detail: 'Blocked IP 203.0.113.45', user: 'firewall', status: 'Blocked', tone: 'danger' }
  ]

  const channelRows: DonutItem[] = [
    { label: 'Organic Search', value: '6,523', percent: '35.8%', share: 35.8, color: '#2de67f' },
    { label: 'Direct', value: '4,812', percent: '26.4%', share: 26.4, color: '#0ba6df' },
    { label: 'Referral', value: '3,245', percent: '17.8%', share: 17.8, color: '#31c0c5' },
    { label: 'Social', value: '2,104', percent: '11.5%', share: 11.5, color: '#f7a72c' },
    { label: 'Email', value: '1,559', percent: '8.5%', share: 8.5, color: '#ff4358' }
  ]

  const deviceRows: DonutItem[] = [
    { label: 'Desktop', value: '10,642', percent: '55.3%', share: 55.3, color: '#33e17f' },
    { label: 'Mobile', value: '6,048', percent: '33.2%', share: 33.2, color: '#088ee6' },
    { label: 'Tablet', value: '1,553', percent: '8.5%', share: 8.5, color: '#21bd65' }
  ]

  const mapDots = [
    { left: 13, top: 52, size: 'sm' },
    { left: 27, top: 47, size: 'lg' },
    { left: 39, top: 55, size: 'sm' },
    { left: 52, top: 35, size: 'xl' },
    { left: 54, top: 48, size: 'lg' },
    { left: 62, top: 44, size: 'md' },
    { left: 70, top: 56, size: 'md' },
    { left: 83, top: 50, size: 'lg' },
    { left: 77, top: 68, size: 'md' },
    { left: 31, top: 66, size: 'md' }
  ]

  let previousContentClass = ''
  let previousFooter = false

  function sparkPoints(values: number[], width = 128, height = 38): string {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const step = width / (values.length - 1 || 1)

    return values
      .map((value, index) => {
        const x = Math.round(index * step)
        const y = Math.round(height - ((value - min) / range) * height)
        return `${x},${Math.max(2, Math.min(height - 2, y))}`
      })
      .join(' ')
  }

  function donutGradient(items: DonutItem[]): string {
    const total = items.reduce((sum, item) => sum + item.share, 0) || 1
    let cursor = 0
    const parts = items.map((item) => {
      const start = cursor
      cursor += (item.share / total) * 100
      return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`
    })

    return `conic-gradient(${parts.join(', ')})`
  }

  onMount(() => {
    setPageTitle('System Analytics')
    previousContentClass = $appOptions.appContentClass
    previousFooter = $appOptions.appFooter
    $appOptions.appContentClass = 'p-0 d-flex flex-column overflow-hidden phibek-analytics-content'
    $appOptions.appFooter = false
  })

  onDestroy(() => {
    $appOptions.appContentClass = previousContentClass
    $appOptions.appFooter = previousFooter
  })
</script>

<div class="system-dashboard">
  <section class="dashboard-hero" aria-label="System analytics heading">
    <div>
      <h1>SYSTEM <span>ANALYTICS</span></h1>
      <p>Real-time overview of platform performance and activity</p>
    </div>

    <div class="dashboard-actions" aria-label="Dashboard controls">
      <button type="button" class="control-button" title="Date range">
        <i class="bi bi-calendar3"></i>
        <span>8 May 2026 - 15 May 2026</span>
        <i class="bi bi-chevron-down"></i>
      </button>
      <button type="button" class="control-button" title="Filters">
        <i class="bi bi-funnel"></i>
        <span>Filters</span>
        <i class="bi bi-chevron-down"></i>
      </button>
    </div>
  </section>

  <section class="status-strip" aria-label="System status">
    {#each statusTiles as tile}
      <article class="status-tile" style={`--tile-color: ${tile.color}`}>
        <div class="status-icon"><i class={`bi ${tile.icon}`}></i></div>
        <div>
          <div class="status-label">{tile.label}</div>
          <div class="status-value">
            <strong>{tile.value}</strong>
            <span>{tile.unit}</span>
          </div>
        </div>
      </article>
    {/each}
  </section>

  <section class="top-grid">
    <article class="panel campaign-panel">
      <div class="panel-header">
        <h2>MARKETING CAMPAIGN</h2>
        <button type="button" class="select-pill" title="Time grain">
          Daily
          <i class="bi bi-chevron-down"></i>
        </button>
      </div>

      <div class="campaign-chart" aria-label="Marketing campaign orders and revenue chart">
        <div class="axis axis-left">
          <span>10K</span>
          <span>8K</span>
          <span>6K</span>
          <span>4K</span>
          <span>2K</span>
          <span>0</span>
        </div>
        <div class="axis axis-right">
          <span>$100K</span>
          <span>$80K</span>
          <span>$60K</span>
          <span>$40K</span>
          <span>$20K</span>
          <span>$0</span>
        </div>
        <div class="chart-field">
          <div class="chart-grid-lines"></div>
          <div class="bar-layer">
            {#each campaignBars as bar}
              <span style={`height: ${bar}%`}></span>
            {/each}
          </div>
          <svg class="campaign-line" viewBox="0 0 960 220" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={`0,220 ${campaignLine} 960,220`} class="campaign-area"></polygon>
            <polyline points={campaignLine}></polyline>
            <circle cx="336" cy="52" r="4"></circle>
            <circle cx="504" cy="80" r="4"></circle>
            <circle cx="924" cy="92" r="4"></circle>
          </svg>
          <div class="campaign-tooltip">
            <strong>15 May 2026</strong>
            <span><i></i> Orders <b>7,842</b></span>
            <span><i></i> Revenue <b>$78,430</b></span>
          </div>
        </div>
        <div class="x-axis">
          {#each campaignTicks as tick}
            <span>{tick}</span>
          {/each}
        </div>
        <div class="chart-legend">
          <span><i></i>Orders</span>
          <span><i></i>Revenue</span>
        </div>
      </div>
    </article>

    <aside class="panel insight-panel" aria-label="Performance insights">
      {#each sideStats as stat}
        <div class="insight-row">
          <div>
            <div class="insight-label">{stat.label}</div>
            <div class="insight-value">{stat.value}</div>
          </div>
          <div class={`insight-delta ${stat.trend}`}>
            <i class={`bi ${stat.trend === 'up' ? 'bi-arrow-up-short' : 'bi-arrow-down-short'}`}></i>
            {stat.delta}
          </div>
          <svg class="mini-spark" viewBox="0 0 128 38" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={sparkPoints(stat.points)}></polyline>
          </svg>
        </div>
      {/each}
    </aside>
  </section>

  <section class="middle-grid">
    <article class="panel sales-panel">
      <div class="panel-header compact">
        <h2>SALES PERFORMANCE</h2>
      </div>

      <div class="sales-metrics">
        {#each salesMetrics as metric}
          <div class="sales-row">
            <div class="metric-icon"><i class={`bi ${metric.icon}`}></i></div>
            <div class="metric-copy">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
            <div class="metric-delta">
              <i class="bi bi-arrow-up-short"></i>{metric.delta}
            </div>
            <svg class="mini-spark" viewBox="0 0 128 38" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={sparkPoints(metric.points)}></polyline>
            </svg>
          </div>
        {/each}
      </div>

      <div class="region-list">
        {#each regions as region}
          <div class="region-row" style={`--region-width: ${region.progress}%`}>
            <span>{region.label}</span>
            <div><i></i></div>
            <strong>{region.value}</strong>
          </div>
        {/each}
      </div>
      <p class="updated-note">Last updated: 10:03:21</p>
    </article>

    <article class="panel map-panel">
      <div class="panel-header compact">
        <h2>BUSINESS METRICS</h2>
      </div>

      <div class="world-map" aria-label="Business metrics world map">
        <div class="map-blob blob-na"></div>
        <div class="map-blob blob-eu"></div>
        <div class="map-blob blob-asia"></div>
        <div class="map-blob blob-sa"></div>
        {#each mapDots as dot}
          <span class={`map-dot ${dot.size}`} style={`left: ${dot.left}%; top: ${dot.top}%`}></span>
        {/each}
      </div>

      <div class="map-summary">
        <div>
          <span>ACTIVE REGIONS</span>
          <strong>24</strong>
        </div>
        <div>
          <span>TOTAL USERS</span>
          <strong>18,243</strong>
        </div>
        <div>
          <span>LIVE SESSIONS</span>
          <strong>3,582</strong>
        </div>
      </div>
    </article>

    <div class="callout-stack">
      <article class="panel callout-card">
        <div class="callout-icon"><i class="bi bi-cpu"></i></div>
        <div>
          <p>INCREASED WEEKLY PRODUCTION RATE BY <strong>9%</strong>, REFLECTING IMPROVED OPERATIONAL PERFORMANCE.</p>
          <div class="callout-grid">
            <span>CURRENT <b>1,600 UNITS</b></span>
            <span>RATE <b>210 UNITS</b></span>
            <span>TARGET <b>2,000 UNITS</b></span>
            <span>PREV. WEEK <b>193 UNITS</b></span>
          </div>
        </div>
      </article>

      <article class="panel callout-card slim">
        <div class="callout-icon"><i class="bi bi-database-fill"></i></div>
        <p>REDUCED SYSTEM DOWNTIME BY <strong>18%</strong>, ENHANCING OVERALL INFRASTRUCTURE RELIABILITY.</p>
      </article>
    </div>
  </section>

  <section class="bottom-grid">
    <article class="panel activity-panel">
      <div class="panel-header compact">
        <h2>RECENT ACTIVITIES</h2>
      </div>

      <div class="activity-table-wrap">
        <table class="activity-table">
          <thead>
            <tr>
              <th>TIME</th>
              <th>EVENT</th>
              <th>DETAILS</th>
              <th>USER</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {#each activityRows as row}
              <tr>
                <td>{row.time}</td>
                <td>{row.event}</td>
                <td>{row.detail}</td>
                <td>{row.user}</td>
                <td><span class={`status-badge ${row.tone}`}>{row.status}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </article>

    <article class="panel donut-panel">
      <div class="panel-header compact">
        <h2>TOP PERFORMING CHANNELS</h2>
      </div>
      <div class="donut-layout">
        <div class="donut" style={`background: ${donutGradient(channelRows)}`}>
          <div>
            <span>Total</span>
            <strong>18,243</strong>
            <small>Sessions</small>
          </div>
        </div>
        <div class="donut-legend">
          {#each channelRows as item}
            <div style={`--dot-color: ${item.color}`}>
              <span><i></i>{item.label}</span>
              <b>{item.value} ({item.percent})</b>
            </div>
          {/each}
        </div>
      </div>
    </article>

    <article class="panel donut-panel">
      <div class="panel-header compact">
        <h2>DEVICE BREAKDOWN</h2>
      </div>
      <div class="donut-layout">
        <div class="donut device" style={`background: ${donutGradient(deviceRows)}`}>
          <div>
            <span>Total</span>
            <strong>18,243</strong>
            <small>Sessions</small>
          </div>
        </div>
        <div class="donut-legend">
          {#each deviceRows as item}
            <div style={`--dot-color: ${item.color}`}>
              <span><i></i>{item.label}</span>
              <b>{item.value} ({item.percent})</b>
            </div>
          {/each}
        </div>
      </div>
    </article>
  </section>

  <section class="health-bar" aria-label="System health">
    <div><span>SYSTEM HEALTH</span><i></i><strong>All Systems Operational</strong></div>
    <div><span>DATA PIPELINE</span><i></i><strong>Healthy</strong></div>
    <div><span>EDGE NODES</span><i></i><strong>128 Online</strong></div>
    <div><span>LAST UPDATED</span><i class="bi bi-clock-history"></i><strong>10:03:21</strong></div>
  </section>
</div>

<style>
  :global(.phibek-analytics-content) {
    background: transparent;
  }

  .system-dashboard {
    --dash-bg: #020a10;
    --dash-bg-soft: rgba(7, 24, 34, .86);
    --panel-bg: linear-gradient(145deg, rgba(6, 22, 32, .94), rgba(2, 12, 19, .92));
    --panel-border: rgba(89, 242, 176, .16);
    --panel-border-strong: rgba(89, 242, 176, .28);
    --dash-text: #eef9f5;
    --dash-muted: rgba(238, 249, 245, .6);
    --dash-faint: rgba(238, 249, 245, .38);
    --grid-line: rgba(93, 229, 177, .1);
    --accent: #2ee886;
    --accent-rgb: 46, 232, 134;
    --danger: #ff405a;
    --warning: #ff9f1c;
    --blue: #39a2ff;
    flex: 1;
    min-height: 100%;
    overflow: auto;
    padding: clamp(16px, 2vw, 28px);
    color: var(--dash-text);
    background:
      radial-gradient(circle at 75% -10%, rgba(57, 162, 255, .12), transparent 32%),
      radial-gradient(circle at 20% 8%, rgba(var(--accent-rgb), .14), transparent 26%),
      linear-gradient(180deg, rgba(1, 9, 15, .96), var(--dash-bg) 42%, #02080d 100%);
    text-transform: uppercase;
  }

  :global([data-bs-theme="light"]) .system-dashboard {
    --dash-bg: #edf5f2;
    --dash-bg-soft: rgba(255, 255, 255, .86);
    --panel-bg: linear-gradient(145deg, rgba(255, 255, 255, .94), rgba(235, 246, 242, .9));
    --panel-border: rgba(5, 122, 80, .18);
    --panel-border-strong: rgba(5, 122, 80, .32);
    --dash-text: #0a1d19;
    --dash-muted: rgba(10, 29, 25, .62);
    --dash-faint: rgba(10, 29, 25, .42);
    --grid-line: rgba(5, 122, 80, .12);
    background:
      radial-gradient(circle at 75% -10%, rgba(57, 162, 255, .14), transparent 32%),
      radial-gradient(circle at 20% 8%, rgba(var(--accent-rgb), .16), transparent 26%),
      linear-gradient(180deg, #f7fbf9, var(--dash-bg) 48%, #e8f2ee 100%);
  }

  .dashboard-hero,
  .dashboard-actions,
  .status-strip,
  .top-grid,
  .middle-grid,
  .bottom-grid,
  .health-bar,
  .panel-header,
  .status-tile,
  .insight-row,
  .sales-row,
  .region-row,
  .map-summary,
  .donut-layout,
  .callout-card {
    display: flex;
  }

  .dashboard-hero {
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .dashboard-hero h1 {
    margin: 0;
    color: var(--dash-text);
    font-size: clamp(24px, 2.1vw, 34px);
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1.05;
  }

  .dashboard-hero h1 span {
    color: var(--dash-muted);
    font-weight: 400;
  }

  .dashboard-hero p {
    margin: 8px 0 0;
    color: var(--dash-muted);
    font-size: 13px;
    text-transform: none;
  }

  .dashboard-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .control-button,
  .select-pill {
    min-height: 42px;
    border: 1px solid var(--panel-border-strong);
    border-radius: 8px;
    background: rgba(8, 20, 30, .62);
    color: var(--dash-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 14px;
    font-size: 13px;
    line-height: 1;
  }

  :global([data-bs-theme="light"]) .control-button,
  :global([data-bs-theme="light"]) .select-pill {
    background: rgba(255, 255, 255, .72);
  }

  .control-button:first-child {
    min-width: 252px;
  }

  .status-strip {
    align-items: stretch;
    gap: 12px;
    margin-bottom: 14px;
  }

  .status-tile,
  .panel {
    position: relative;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    background: var(--panel-bg);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .03), 0 18px 40px rgba(0, 0, 0, .16);
  }

  .status-tile {
    flex: 1;
    align-items: center;
    gap: 18px;
    min-width: 180px;
    min-height: 88px;
    padding: 16px 18px;
    overflow: hidden;
  }

  .status-tile::after {
    content: "";
    position: absolute;
    inset: auto 18px 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--tile-color), transparent);
    opacity: .45;
  }

  .status-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tile-color) 42%, transparent);
    border-radius: 8px;
    color: var(--tile-color);
    background: color-mix(in srgb, var(--tile-color) 12%, transparent);
    box-shadow: 0 0 24px color-mix(in srgb, var(--tile-color) 18%, transparent);
    font-size: 22px;
  }

  .status-label {
    margin-bottom: 8px;
    color: var(--tile-color);
    font-size: 12px;
    font-weight: 800;
  }

  .status-value {
    display: flex;
    align-items: baseline;
    gap: 8px;
    color: var(--dash-muted);
    font-size: 12px;
    text-transform: none;
  }

  .status-value strong {
    color: var(--dash-text);
    font-size: 30px;
    font-weight: 500;
    line-height: 1;
  }

  .top-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
    gap: 14px;
    margin-bottom: 14px;
  }

  .middle-grid {
    display: grid;
    grid-template-columns: minmax(280px, .9fr) minmax(420px, 1.35fr) minmax(300px, 1.1fr);
    gap: 14px;
    margin-bottom: 14px;
  }

  .bottom-grid {
    display: grid;
    grid-template-columns: minmax(520px, 1.5fr) minmax(310px, .9fr) minmax(310px, .95fr);
    gap: 14px;
    margin-bottom: 14px;
  }

  .panel {
    min-width: 0;
    overflow: hidden;
  }

  .panel-header {
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px 8px;
  }

  .panel-header.compact {
    min-height: 44px;
    padding-bottom: 6px;
  }

  .panel-header h2 {
    margin: 0;
    color: var(--dash-text);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .select-pill {
    min-height: 32px;
    min-width: 112px;
    color: var(--dash-muted);
    font-size: 12px;
  }

  .campaign-chart {
    position: relative;
    min-height: 332px;
    padding: 24px 54px 58px 46px;
  }

  .axis {
    position: absolute;
    top: 24px;
    bottom: 58px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--dash-muted);
    font-size: 11px;
  }

  .axis-left {
    left: 18px;
  }

  .axis-right {
    right: 10px;
    text-align: right;
  }

  .chart-field {
    position: relative;
    height: 250px;
    overflow: hidden;
    border-bottom: 1px solid var(--grid-line);
  }

  .chart-grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
    background-size: 100% 20%, 9.1% 100%;
  }

  .bar-layer {
    position: absolute;
    inset: 0 8px 0 8px;
    display: flex;
    align-items: flex-end;
    gap: 3px;
  }

  .bar-layer span {
    flex: 1;
    min-width: 2px;
    background: linear-gradient(180deg, rgba(var(--accent-rgb), .74), rgba(var(--accent-rgb), .18));
    border-top: 1px solid rgba(128, 255, 190, .88);
    box-shadow: 0 0 14px rgba(var(--accent-rgb), .12);
  }

  .campaign-line {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .campaign-line polyline {
    fill: none;
    stroke: #43f48c;
    stroke-width: 3;
    stroke-linejoin: round;
    stroke-linecap: round;
    filter: drop-shadow(0 0 7px rgba(var(--accent-rgb), .45));
  }

  .campaign-line circle {
    fill: #43f48c;
    stroke: rgba(255, 255, 255, .65);
    stroke-width: 1;
  }

  .campaign-area {
    fill: rgba(var(--accent-rgb), .09);
  }

  .campaign-tooltip {
    position: absolute;
    top: 42px;
    right: 52px;
    width: min(160px, 38%);
    border: 1px solid rgba(var(--accent-rgb), .36);
    border-radius: 8px;
    background: rgba(3, 18, 25, .84);
    color: var(--dash-muted);
    padding: 12px 13px;
    font-size: 11px;
    text-transform: none;
    backdrop-filter: blur(6px);
  }

  :global([data-bs-theme="light"]) .campaign-tooltip {
    background: rgba(255, 255, 255, .9);
  }

  .campaign-tooltip strong {
    display: block;
    margin-bottom: 8px;
    color: var(--dash-text);
    font-weight: 600;
  }

  .campaign-tooltip span {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }

  .campaign-tooltip i,
  .chart-legend i {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 2px;
    background: var(--accent);
  }

  .campaign-tooltip b {
    color: var(--dash-text);
    font-weight: 600;
  }

  .x-axis {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
    margin: 12px 8px 0;
    color: var(--dash-muted);
    font-size: 11px;
    text-align: center;
  }

  .chart-legend {
    position: absolute;
    right: 0;
    bottom: 16px;
    left: 0;
    display: flex;
    justify-content: center;
    gap: 22px;
    color: var(--dash-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .chart-legend span:nth-child(2) i {
    background: rgba(var(--accent-rgb), .55);
  }

  .insight-panel {
    padding: 12px 16px;
  }

  .insight-row {
    position: relative;
    min-height: 73px;
    align-items: center;
    gap: 14px;
    padding: 9px 0;
    border-bottom: 1px solid var(--grid-line);
  }

  .insight-row:last-child {
    border-bottom: 0;
  }

  .insight-row > div:first-child {
    min-width: 128px;
  }

  .insight-label,
  .metric-copy span,
  .map-summary span,
  .activity-table th,
  .health-bar span,
  .updated-note {
    color: var(--dash-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .insight-value {
    margin-top: 4px;
    color: var(--dash-text);
    font-size: 21px;
    line-height: 1.1;
    text-transform: none;
  }

  .insight-delta {
    width: 70px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
  }

  .insight-delta.down {
    color: var(--accent);
  }

  .mini-spark {
    flex: 1;
    min-width: 86px;
    height: 38px;
  }

  .mini-spark polyline {
    fill: none;
    stroke: #42f28c;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px rgba(var(--accent-rgb), .42));
  }

  .sales-panel {
    padding-bottom: 12px;
  }

  .sales-metrics {
    padding: 4px 16px 10px;
  }

  .sales-row {
    align-items: center;
    gap: 12px;
    min-height: 48px;
  }

  .metric-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--accent);
    background: rgba(var(--accent-rgb), .1);
  }

  .metric-copy {
    min-width: 84px;
  }

  .metric-copy strong {
    display: block;
    color: var(--dash-text);
    font-size: 15px;
    font-weight: 600;
    text-transform: none;
  }

  .metric-delta {
    width: 76px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
  }

  .region-list {
    margin: 0 16px;
    padding-top: 12px;
    border-top: 1px solid var(--grid-line);
  }

  .region-row {
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .region-row span {
    flex: 1;
    color: var(--dash-text);
    font-size: 12px;
    font-weight: 600;
  }

  .region-row div {
    width: 120px;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, .06);
    overflow: hidden;
  }

  :global([data-bs-theme="light"]) .region-row div {
    background: rgba(8, 36, 28, .08);
  }

  .region-row i {
    display: block;
    width: var(--region-width);
    height: 100%;
    background: linear-gradient(90deg, var(--accent), #55ffaa);
  }

  .region-row strong {
    width: 42px;
    color: var(--dash-text);
    font-size: 12px;
    font-weight: 600;
    text-align: right;
  }

  .updated-note {
    margin: 10px 16px 0;
    text-transform: none;
  }

  .map-panel {
    display: flex;
    flex-direction: column;
  }

  .world-map {
    position: relative;
    flex: 1;
    min-height: 244px;
    margin: 0 16px 10px;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid rgba(var(--accent-rgb), .1);
    background:
      linear-gradient(rgba(var(--accent-rgb), .05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(var(--accent-rgb), .05) 1px, transparent 1px),
      radial-gradient(circle at 56% 42%, rgba(var(--accent-rgb), .2), transparent 16%),
      linear-gradient(180deg, rgba(12, 40, 52, .5), rgba(4, 15, 22, .55));
    background-size: 38px 38px, 38px 38px, auto, auto;
  }

  :global([data-bs-theme="light"]) .world-map {
    background:
      linear-gradient(rgba(5, 122, 80, .06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(5, 122, 80, .06) 1px, transparent 1px),
      radial-gradient(circle at 56% 42%, rgba(var(--accent-rgb), .2), transparent 16%),
      linear-gradient(180deg, rgba(255, 255, 255, .6), rgba(223, 241, 235, .58));
  }

  .map-blob {
    position: absolute;
    border-radius: 48% 52% 42% 58%;
    background: rgba(130, 178, 170, .14);
    filter: blur(.1px);
    transform: rotate(-12deg);
  }

  .blob-na {
    left: 7%;
    top: 35%;
    width: 24%;
    height: 28%;
  }

  .blob-eu {
    left: 42%;
    top: 24%;
    width: 16%;
    height: 18%;
  }

  .blob-asia {
    left: 55%;
    top: 29%;
    width: 34%;
    height: 31%;
  }

  .blob-sa {
    left: 25%;
    top: 58%;
    width: 15%;
    height: 25%;
    transform: rotate(14deg);
  }

  .map-dot {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #54ff9a;
    box-shadow: 0 0 0 6px rgba(var(--accent-rgb), .14), 0 0 22px rgba(var(--accent-rgb), .75);
    transform: translate(-50%, -50%);
  }

  .map-dot.sm {
    width: 8px;
    height: 8px;
  }

  .map-dot.lg {
    width: 14px;
    height: 14px;
  }

  .map-dot.xl {
    width: 18px;
    height: 18px;
    box-shadow: 0 0 0 34px rgba(var(--accent-rgb), .16), 0 0 0 66px rgba(var(--accent-rgb), .08), 0 0 28px rgba(var(--accent-rgb), .9);
  }

  .map-summary {
    align-items: stretch;
    margin: 0 16px 16px;
    border: 1px solid var(--grid-line);
    border-radius: 6px;
    overflow: hidden;
  }

  .map-summary div {
    flex: 1;
    padding: 12px;
    text-align: center;
    border-right: 1px solid var(--grid-line);
  }

  .map-summary div:last-child {
    border-right: 0;
  }

  .map-summary strong {
    display: block;
    margin-top: 4px;
    color: var(--dash-text);
    font-size: 18px;
    font-weight: 600;
    text-transform: none;
  }

  .callout-stack {
    display: grid;
    gap: 14px;
  }

  .callout-card {
    align-items: flex-start;
    gap: 16px;
    min-height: 148px;
    padding: 18px;
  }

  .callout-card.slim {
    min-height: 90px;
    align-items: center;
  }

  .callout-icon {
    width: 42px;
    height: 42px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 8px;
    color: var(--accent);
    background: rgba(var(--accent-rgb), .14);
    font-size: 24px;
    box-shadow: 0 0 22px rgba(var(--accent-rgb), .14);
  }

  .callout-card p {
    margin: 0;
    color: var(--dash-muted);
    font-size: 12px;
    line-height: 1.7;
  }

  .callout-card strong {
    color: var(--accent);
  }

  .callout-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 20px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--grid-line);
  }

  .callout-grid span {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--dash-muted);
    font-size: 11px;
  }

  .callout-grid b {
    color: var(--dash-text);
  }

  .activity-panel {
    min-height: 224px;
  }

  .activity-table-wrap {
    overflow-x: auto;
    padding: 0 16px 16px;
  }

  .activity-table {
    width: 100%;
    min-width: 620px;
    border-collapse: collapse;
    color: var(--dash-muted);
    font-size: 12px;
    text-transform: none;
  }

  .activity-table th,
  .activity-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--grid-line);
    white-space: nowrap;
  }

  .activity-table th {
    text-align: left;
    text-transform: uppercase;
  }

  .activity-table td:nth-child(3) {
    white-space: normal;
    min-width: 220px;
  }

  .activity-table td:nth-child(2),
  .activity-table td:nth-child(5) {
    color: var(--dash-text);
  }

  .status-badge {
    display: inline-flex;
    min-width: 66px;
    justify-content: center;
    border-radius: 5px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
  }

  .status-badge.success {
    color: #5cff9c;
    background: rgba(var(--accent-rgb), .13);
  }

  .status-badge.warning {
    color: #ffca59;
    background: rgba(255, 159, 28, .14);
  }

  .status-badge.danger {
    color: #ff6b7b;
    background: rgba(255, 64, 90, .14);
  }

  .donut-panel {
    padding-bottom: 16px;
  }

  .donut-layout {
    align-items: center;
    gap: 20px;
    padding: 8px 18px 0;
  }

  .donut {
    width: 142px;
    aspect-ratio: 1;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
  }

  .donut > div {
    width: 88px;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--dash-text);
    background: var(--dash-bg);
    text-align: center;
    line-height: 1.1;
    text-transform: none;
  }

  :global([data-bs-theme="light"]) .donut > div {
    background: #f4fbf8;
  }

  .donut span {
    color: var(--dash-muted);
    font-size: 13px;
  }

  .donut strong {
    font-size: 20px;
    font-weight: 500;
  }

  .donut small {
    color: var(--dash-muted);
    font-size: 11px;
  }

  .donut-legend {
    flex: 1;
    display: grid;
    gap: 9px;
    min-width: 0;
  }

  .donut-legend div,
  .donut-legend span {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .donut-legend div {
    justify-content: space-between;
    min-width: 0;
    color: var(--dash-muted);
    font-size: 11px;
  }

  .donut-legend i,
  .health-bar div > i:not(.bi) {
    width: 10px;
    height: 10px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--dot-color, var(--accent));
    box-shadow: 0 0 12px color-mix(in srgb, var(--dot-color, var(--accent)) 70%, transparent);
  }

  .donut-legend b {
    color: var(--dash-muted);
    font-size: 11px;
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
  }

  .health-bar {
    align-items: center;
    justify-content: space-between;
    gap: 0;
    min-height: 54px;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    background: var(--panel-bg);
    overflow: hidden;
  }

  .health-bar div {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 54px;
    padding: 0 16px;
    border-right: 1px solid var(--grid-line);
  }

  .health-bar div:last-child {
    border-right: 0;
  }

  .health-bar strong {
    color: var(--dash-text);
    font-size: 12px;
    font-weight: 500;
    text-transform: none;
  }

  .health-bar .bi {
    color: var(--dash-muted);
  }

  @media (max-width: 1439.98px) {
    .status-strip {
      flex-wrap: wrap;
    }

    .status-tile {
      flex: 1 1 calc(33.333% - 12px);
    }

    .middle-grid,
    .bottom-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .callout-stack,
    .activity-panel {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 1199.98px) {
    .top-grid {
      grid-template-columns: 1fr;
    }

    .insight-panel {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 18px;
    }
  }

  @media (max-width: 991.98px) {
    .dashboard-hero {
      align-items: flex-start;
      flex-direction: column;
    }

    .dashboard-actions {
      width: 100%;
      justify-content: stretch;
    }

    .control-button {
      flex: 1 1 220px;
    }

    .middle-grid,
    .bottom-grid {
      grid-template-columns: 1fr;
    }

    .bottom-grid {
      grid-auto-flow: row;
    }

    .activity-panel,
    .callout-stack {
      grid-column: auto;
    }

    .donut-layout {
      justify-content: flex-start;
    }

    .health-bar {
      flex-wrap: wrap;
    }

    .health-bar div {
      flex: 1 1 50%;
    }
  }

  @media (max-width: 767.98px) {
    .system-dashboard {
      padding: 14px;
    }

    .status-tile {
      flex-basis: 100%;
      min-height: 82px;
    }

    .campaign-chart {
      min-height: 306px;
      padding: 22px 18px 68px 30px;
    }

    .axis-right,
    .campaign-tooltip {
      display: none;
    }

    .bar-layer {
      gap: 2px;
    }

    .x-axis {
      grid-template-columns: repeat(4, 1fr);
      row-gap: 8px;
    }

    .insight-panel {
      grid-template-columns: 1fr;
    }

    .insight-row {
      gap: 10px;
    }

    .insight-row > div:first-child {
      min-width: 108px;
    }

    .middle-grid,
    .top-grid,
    .bottom-grid,
    .callout-stack {
      gap: 12px;
    }

    .world-map {
      min-height: 210px;
    }

    .map-summary {
      flex-direction: column;
    }

    .map-summary div {
      border-right: 0;
      border-bottom: 1px solid var(--grid-line);
    }

    .map-summary div:last-child {
      border-bottom: 0;
    }

    .callout-card,
    .donut-layout {
      align-items: flex-start;
      flex-direction: column;
    }

    .callout-grid {
      grid-template-columns: 1fr;
    }

    .health-bar div {
      flex-basis: 100%;
      justify-content: flex-start;
      border-right: 0;
      border-bottom: 1px solid var(--grid-line);
    }

    .health-bar div:last-child {
      border-bottom: 0;
    }
  }
</style>

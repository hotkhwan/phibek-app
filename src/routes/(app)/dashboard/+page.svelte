<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'

  const statusTiles = [
    ['ACTIVE', 'BACKUP', 'text-success'],
    ['ACTIVE', 'FIREWALL', 'text-success'],
    ['DETECTED', 'THREAT', 'text-danger'],
    ['PENDING', 'SYNC', 'text-warning'],
    ['LOCKED', 'DATA VAULT', 'text-success']
  ]

  const sideStats = [
    ['PAGE VIEWS', '12,543'],
    ['AVG SESS. DURATION', '02:34'],
    ['NEW VISITORS', '45.2%'],
    ['BOUNCE RATE', '32.6%'],
    ['TOP REFERRING SITES', 'Google'],
    ['COUNTRIES REACH', '87']
  ]

  const salesMetrics = [
    ['bi-currency-dollar', 'REVENUE', '$7.5M'],
    ['bi-people', 'CUSTOMERS', '45K'],
    ['bi-cash-stack', 'PROFIT', '$3.2M'],
    ['bi-grid', 'LAUNCHES', '4'],
    ['bi-send', 'VISITS', '1.3M'],
    ['bi-shop', 'SALES', '$8.9M']
  ]

  const regions = [
    ['1', 'NORTH AMERICA REGION', '$700K', 75],
    ['2', 'EUROPE REGION', '$850K', 85],
    ['3', 'ASIA-PACIFIC REGION', '$600K', 60],
    ['4', 'SOUTH AMERICA REGION', '$900K', 90],
    ['5', 'AFRICA REGION', '$400K', 40]
  ]

  const dots = [
    [47, 33], [49, 30], [51, 31], [52, 38], [55, 43], [57, 54],
    [62, 60], [70, 55], [75, 62], [15, 55], [16, 58], [88, 51]
  ]

  onMount(() => {
    setPageTitle('System Analytics')
    $appOptions.appContentClass = 'p-0 d-flex flex-column'
  })

  onDestroy(() => {
    $appOptions.appContentClass = ''
  })
</script>

<div class="cyber-dashboard">
  <div class="app-content-header">
    <div class="page-header flex-1">SYSTEM <span class="opacity-5 fw-300">ANALYTICS</span></div>
    <div class="d-md-flex d-none align-items-center gap-2 fw-semibold m-n1 m-lg-n2 text-center small">
      {#each statusTiles as tile}
        <div class="w-80px border">
          <div class="{tile[2]} py-2px bg-black bg-opacity-10 border-bottom">{tile[0]}</div>
          <div class="bg-secondary bg-opacity-25 py-2px">{tile[1]}</div>
        </div>
      {/each}
    </div>
  </div>

  <div class="flex-1 overflow-auto">
    <div class="card border-bottom border-0">
      <div class="card-header with-btn py-1">
        <div class="fw-semibold">MARKETING CAMPAIGN</div>
        <div class="hud-line flex-1"></div>
        <div class="card-header-btn">
          <span class="btn"><i class="bi bi-dash-lg"></i></span>
          <span class="btn"><i class="bi bi-arrows-fullscreen"></i></span>
          <span class="btn"><i class="bi bi-x-lg"></i></span>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="row flex-nowrap g-0">
          <div class="col-lg-10 w-auto flex-1">
            <div class="campaign-chart">
              <div class="chart-grid"></div>
              <div class="bar-layer">
                {#each Array.from({ length: 96 }) as _, i}
                  <span style={`height: ${42 + Math.round(Math.sin(i / 13) * 28 + Math.sin(i / 7) * 18 + (i % 7) * 2)}%`}></span>
                {/each}
              </div>
              <svg viewBox="0 0 960 260" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points="0,185 40,150 80,128 120,132 160,108 200,116 240,90 280,104 320,82 360,96 400,88 440,115 480,138 520,160 560,174 600,202 640,210 680,226 720,214 760,220 800,205 840,196 880,184 920,170 960,142"
                />
              </svg>
              <div class="chart-legend"><span></span> ORDERS <span></span> REVENUE</div>
            </div>
          </div>
          <div class="col-lg-2 border-start w-250px d-none d-lg-block text-body text-opacity-50">
            {#each sideStats as stat}
              <div class="p-3 border-top">
                <div class="fw-semibold small">{stat[0]}</div>
                <div class="d-flex align-items-center">
                  <div class="fw-semibold fs-4 text-body flex-1">{stat[1]}</div>
                  <div class="sparkline"><span></span></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <div class="row g-0 border-bottom">
      <div class="col-lg-4 border-end-0 border-lg-end">
        <div class="card border-0 h-100">
          <div class="card-header with-btn py-1">
            <div class="fw-semibold">SALES PERFORMANCE</div>
            <div class="hud-line flex-1"></div>
            <div class="card-header-btn"><span class="btn"><i class="bi bi-dash-lg"></i></span><span class="btn"><i class="bi bi-arrows-fullscreen"></i></span><span class="btn"><i class="bi bi-x-lg"></i></span></div>
          </div>
          <div class="card-body p-0 text-uppercase">
            <div class="row row-grid g-0 border-bottom">
              {#each salesMetrics as metric}
                <div class="col-6 px-3 py-2">
                  <div class="d-flex gap-3 align-items-center">
                    <div class="fs-26px text-theme d-flex"><i class="bi {metric[0]}"></i></div>
                    <div class="flex-1">
                      <div class="fw-semibold text-body text-opacity-50 small">{metric[1]}</div>
                      <div class="fs-6 fw-semibold text-body">{metric[2]}</div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
            <div class="p-3">
              {#each regions as region}
                <div class="d-flex align-items-center mb-1">
                  <span class="w-15px h-15px d-flex align-items-center bg-theme text-black justify-content-center">{region[0]}</span>
                  <span class="flex-1 ps-2">{region[1]}</span>
                  <span class="w-100px"><div class="progress h-3px bg-theme bg-opacity-10"><div class="progress-bar bg-theme" style={`width: ${region[3]}%`}></div></div></span>
                  <span class="w-50px text-end fw-semibold">{region[2]}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4 border-lg-top-0 border-top border-end-0 border-lg-end">
        <div class="card border-0 h-100">
          <div class="card-header with-btn py-1">
            <div class="fw-semibold">BUSINESS METRICS</div>
            <div class="hud-line flex-1"></div>
            <div class="card-header-btn"><span class="btn"><i class="bi bi-dash-lg"></i></span><span class="btn"><i class="bi bi-arrows-fullscreen"></i></span><span class="btn"><i class="bi bi-x-lg"></i></span></div>
          </div>
          <div class="position-relative">
            <div class="world-map border-bottom">
              {#each dots as dot}<span style={`left:${dot[0]}%;top:${dot[1]}%`}></span>{/each}
            </div>
            <div class="text-uppercase">
              <div class="row row-grid g-0 text-body text-opacity-50 fw-semibold text-center">
                <div class="col-4 py-2"><div class="small">Active Regions:</div><div class="fs-5 text-body">27</div></div>
                <div class="col-4 py-2"><div class="small">Total Users:</div><div class="fs-5 text-body">1.2M</div></div>
                <div class="col-4 py-2"><div class="small">Live Sessions:</div><div class="fs-5 text-body">3,482</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4 border-lg-top-0 border-top">
        <div class="card border-0 h-100">
          <div class="card-header with-btn py-1">
            <div class="fw-semibold">OPERATIONAL OVERVIEW</div>
            <div class="hud-line flex-1"></div>
            <div class="card-header-btn"><span class="btn"><i class="bi bi-dash-lg"></i></span><span class="btn"><i class="bi bi-arrows-fullscreen"></i></span><span class="btn"><i class="bi bi-x-lg"></i></span></div>
          </div>
          <div class="card-body">
            <div class="d-flex fs-10px">
              <div class="fs-40px text-theme"><i class="bi bi-cpu"></i></div>
              <div class="flex-1 ps-3">
                <div>Increased weekly production rate by <span class="text-success fw-semibold">5%</span>, reflecting improved operational performance.</div>
                <hr />
                <div class="row gx-0 text-truncate">
                  <div class="col-6"><div class="text-body text-opacity-50">CURRENT: <span class="text-white fw-semibold">1,000 UNITS</span></div><div class="text-body text-opacity-50">TARGET: <span class="text-white fw-semibold">1,200 UNITS</span></div></div>
                  <div class="col-6"><div class="text-body text-opacity-50">RATE: <span class="text-white fw-semibold">200 UNITS/W</span></div><div class="text-body text-opacity-50">PREV WEEK: <span class="text-white fw-semibold">190 UNITS</span></div></div>
                </div>
              </div>
            </div>
          </div>
          <div class="card-body border-top">
            <div class="d-flex fs-10px">
              <div class="fs-40px text-theme"><i class="bi bi-server"></i></div>
              <div class="flex-1 ps-3">
                <div>Reduced system downtime by <span class="text-success fw-semibold">12%</span>, enhancing overall infrastructure reliability.</div>
                <hr />
                <div class="row gx-0 text-truncate">
                  <div class="col-6"><div class="text-body text-opacity-50">CURRENT: <span class="text-white fw-semibold">98.2% UPTIME</span></div><div class="text-body text-opacity-50">TARGET: <span class="text-white fw-semibold">99.0% UPTIME</span></div></div>
                  <div class="col-6"><div class="text-body text-opacity-50">GROWTH: <span class="text-white fw-semibold">+0.8%</span></div><div class="text-body text-opacity-50">PREV WEEK: <span class="text-white fw-semibold">97.5% UPTIME</span></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .cyber-dashboard {
    min-height: calc(100dvh - 35px);
    text-transform: uppercase;
  }
  .campaign-chart {
    position: relative;
    min-height: 388px;
    padding: 32px 28px 42px;
    overflow: hidden;
  }
  .chart-grid {
    position: absolute;
    inset: 28px;
    background-image:
      linear-gradient(rgba(var(--bs-theme-rgb), .18) 1px, transparent 1px),
      linear-gradient(90deg, rgba(var(--bs-theme-rgb), .18) 1px, transparent 1px);
    background-size: 44px 28px;
  }
  .bar-layer {
    position: absolute;
    inset: 36px 30px 56px;
    display: flex;
    align-items: end;
    gap: 2px;
  }
  .bar-layer span {
    flex: 1;
    min-width: 2px;
    background: rgba(var(--bs-theme-rgb), .48);
    border-top: 1px solid rgba(var(--bs-theme-rgb), .95);
    box-shadow: 0 0 10px rgba(var(--bs-theme-rgb), .18);
  }
  .campaign-chart svg {
    position: absolute;
    inset: 42px 32px 58px;
    width: calc(100% - 64px);
    height: calc(100% - 100px);
  }
  .campaign-chart polyline {
    fill: none;
    stroke: var(--bs-theme);
    stroke-width: 2;
    opacity: .9;
  }
  .chart-legend {
    position: absolute;
    bottom: 20px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
  }
  .chart-legend span {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin: 0 7px 0 16px;
    background: var(--bs-theme);
  }
  .sparkline {
    height: 24px;
    width: 80px;
    position: relative;
    overflow: hidden;
  }
  .sparkline span {
    position: absolute;
    inset: 8px 0 0;
    border-top: 2px solid var(--bs-theme);
    transform: skewY(-12deg);
    opacity: .9;
  }
  .world-map {
    height: 214px;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at 51% 32%, rgba(var(--bs-theme-rgb), .32) 0 2px, transparent 3px),
      radial-gradient(circle at 48% 43%, rgba(var(--bs-theme-rgb), .18) 0 90px, transparent 91px),
      radial-gradient(circle at 22% 55%, rgba(var(--bs-theme-rgb), .13) 0 42px, transparent 43px),
      radial-gradient(circle at 72% 52%, rgba(var(--bs-theme-rgb), .15) 0 78px, transparent 79px),
      linear-gradient(180deg, rgba(var(--bs-theme-rgb), .12), rgba(var(--bs-theme-rgb), .03));
  }
  .world-map::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(var(--bs-theme-rgb), .08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(var(--bs-theme-rgb), .08) 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: .25;
  }
  .world-map span {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bs-theme);
    box-shadow: 0 0 14px rgba(var(--bs-theme-rgb), .9);
    transform: translate(-50%, -50%);
  }
  @media (max-width: 991.98px) {
    .campaign-chart {
      min-height: 300px;
    }
  }
</style>

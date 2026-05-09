<!-- src/routes/(public)/landing/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { setPageTitle } from '$lib/utils/title'
  import { asset } from '$lib/utils/asset'

  const features = [
    ['bi-display', 'Responsive Design', 'Operate cameras, IoT events, and command views from desktop, wall displays, and tablets.'],
    ['bi-cpu', 'AI Operations', 'AI search and edge intelligence stay close to the operator workflow.'],
    ['bi-shield-lock', 'Secure Portal', 'Account, license, and organization controls are grouped for production teams.'],
    ['bi-broadcast', 'Live Signals', 'Realtime streams, maps, and alerts are ready for the PHIBEK command surface.']
  ]

  const mockups = [
    ['Dashboard', '/img/landing/mockup-1-thumb.jpg'],
    ['Video Wall', '/img/landing/mockup-2-thumb.jpg'],
    ['Profile', '/img/landing/mockup-5-thumb.jpg'],
    ['Pricing', '/img/landing/mockup-4-thumb.jpg']
  ]

  onMount(() => setPageTitle('PHIBEK พิเภท'))
</script>

<div class="landing-page">
  <header class="app-header navbar navbar-expand-lg p-0 h-auto d-block position-fixed top-0 start-0 end-0 z-1030">
    <div class="w-100 bg-body bg-opacity-90">
      <div class="container-lg container-fluid text-center text-body text-opacity-50 py-10px">
        PHIBEK พิเภท PLATFORM SHELL IS LIVE. CYBER ADMIN STYLE, SVELTEKIT POWERED.
      </div>
    </div>
    <div class="container-lg container-fluid py-3">
      <a class="navbar-brand d-flex align-items-center position-relative mx-auto mx-lg-0 me-lg-auto brand px-0 w-auto fs-5" href={resolve('/landing')}>
        <img src={asset('/img/logo/phibek-mark.svg')} alt="PHIBEK" class="landing-brand-mark" />
        <span>PHIBEK <span class="opacity-5">พิเภท</span></span>
      </a>
      <div class="d-none d-lg-flex navbar-nav gap-3 mx-auto fw-semibold">
        <a href="#home" class="nav-link">HOME</a>
        <a href="#about" class="nav-link">ABOUT</a>
        <a href="#features" class="nav-link">FEATURES</a>
        <a href="#contact" class="nav-link">CONTACT</a>
      </div>
      <div class="d-flex gap-2">
        <a href={resolve('/auth/login')} class="btn btn-secondary">SIGN IN</a>
        <a href={resolve('/dashboard')} class="btn btn-theme">DASHBOARD</a>
      </div>
    </div>
  </header>

  <main id="home" class="landing-hero">
    <div class="container-lg container-fluid text-center">
      <h6 class="text-uppercase text-theme fw-semibold mb-3">Built for PHIBEK operations</h6>
      <h1 class="display-6 fw-bold mb-4">A Cyber Command Portal for AI, IoT, and Live Monitoring</h1>
      <p class="lead mb-4">
        A SvelteKit operator surface based on the Cyber Admin template, keeping the original HUD rhythm while connecting to PHIBEK workflows.
      </p>
      <div class="d-flex justify-content-center gap-2 mb-5">
        <a href={resolve('/auth/login')} class="btn btn-theme btn-lg w-150px">SIGN IN</a>
        <a href={resolve('/dashboard')} class="btn btn-outline-secondary btn-lg w-150px">OPEN APP</a>
      </div>
      <div class="landing-cover-wrap">
        <img src={asset('/img/landing/cover.jpg')} alt="PHIBEK dashboard preview" class="landing-cover shadow-lg" />
      </div>
    </div>
  </main>

  <hr class="opacity-1 my-0" />

  <section id="about" class="py-5 bg-body bg-opacity-75">
    <div class="container-lg container-fluid my-5">
      <div class="text-center mb-lg-5 mb-4">
        <h1 class="mb-3">About PHIBEK Winn</h1>
        <p class="fs-5 text-body text-opacity-50 mb-0">
          The portal brings navigation, user portal pages, and live operations into one Cyber-styled interface.
        </p>
      </div>
      <div class="row text-start g-3 gx-lg-5 gy-lg-4">
        {#each features as feature}
          <div class="col-md-3 col-6 d-flex gap-3">
            <div class="landing-feature-icon"><i class="bi {feature[0]}"></i></div>
            <div class="flex-1">
              <h4>{feature[1]}</h4>
              <p class="text-body text-opacity-50">{feature[2]}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <hr class="opacity-1 my-0" />

  <section id="features" class="py-5 bg-body bg-opacity-75">
    <div class="container-lg container-fluid my-5">
      <div class="text-center mb-lg-5 mb-4">
        <h1 class="mb-3">Portal Surfaces</h1>
        <p class="fs-5 text-body text-opacity-50 mb-0">Initial screens are aligned to the Cyber Admin source so the product can be tuned with real data next.</p>
      </div>
      <div class="row g-3 g-lg-5 text-uppercase">
        {#each mockups as mockup}
          <div class="col-sm-3 col-6">
            <a href={resolve('/dashboard')} class="shadow d-block">
              <img src={asset(mockup[1])} alt={mockup[0]} class="mw-100" />
            </a>
            <div class="text-center my-3 text-body fw-semibold">{mockup[0]}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <footer id="contact" class="py-4 border-top text-center text-body text-opacity-50">
    PHIBEK พิเภท · CYBER ADMIN SVELTEKIT
  </footer>
</div>

<style>
  .landing-page {
    min-height: 100dvh;
    text-transform: uppercase;
  }
  .landing-brand-mark {
    width: 34px;
    height: 34px;
    margin-right: .65rem;
    filter: drop-shadow(0 0 8px rgba(232, 184, 75, .4));
  }
  .landing-hero {
    padding-top: 145px;
    padding-bottom: 60px;
    position: relative;
  }
  .landing-hero .lead {
    max-width: 780px;
    margin-left: auto;
    margin-right: auto;
    color: rgba(255,255,255,.55);
  }
  .landing-cover-wrap {
    padding-inline: clamp(0px, 5vw, 70px);
  }
  .landing-cover {
    width: 100%;
    border: 1px solid rgba(255,255,255,.16);
  }
  .landing-feature-icon {
    width: 70px;
    height: 70px;
    background: rgba(255,255,255,.1);
    color: var(--bs-theme);
    font-size: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  @media (max-width: 991.98px) {
    .landing-hero {
      padding-top: 125px;
    }
  }
  @media (max-width: 575.98px) {
    .landing-page .btn {
      width: auto !important;
    }
    .landing-feature-icon {
      width: 52px;
      height: 52px;
      font-size: 28px;
    }
  }
</style>

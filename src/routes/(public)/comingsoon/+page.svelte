<!-- src/routes/(public)/comingsoon/+page.svelte -->
<script lang="ts">
  import { m } from '$lib/i18n/messages'

  const year = new Date().getFullYear()
</script>

<div class="coming-soon d-flex flex-column">
  <div class="coming-soon-content mb-3">
    <div class="display-2 lh-1 py-3"><i class="bi bi-tools text-theme"></i></div>
    <div class="fs-1">{m.comingsoonTitle()}</div>
    <div class="coming-soon-timer">
      <div class="d-flex justify-content-center gap-3 text-uppercase fw-bold">
        <span>Phibek</span>
        <span class="text-theme">Platform</span>
      </div>
    </div>
    <p class="mb-3">
      {m.comingsoonDescriptionLine1()}<br />
      {m.comingsoonDescriptionLine2()}
    </p>
    <div class="input-group w-350px mb-3 mx-auto">
      <input type="email" class="form-control" placeholder="Email Address" />
      <button type="button" class="btn btn-secondary">SUBSCRIBE</button>
    </div>
    <div class="small fw-semibold text-uppercase text-body text-opacity-50">
      {m.subscribeHint()}
    </div>
  </div>
  <div class="px-3 py-4 text-center text-uppercase text-body text-opacity-50 fw-semibold">
    © {year} Phibek Platform
  </div>
</div>

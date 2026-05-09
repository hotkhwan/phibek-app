<!-- src/routes/(app)/iotControl/sop/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { m } from '$lib/i18n/messages'

  onMount(() => setPageTitle(`${m.navIotControl()} · ${m.navIotControlSop()}`))
</script>

<DomainStarter title={m.navIotControlSop()} subtitle="Standard operating procedures" icon="bi-list-check" legacyName="kcontrol/sop">
  <div class="card">
    <div class="card-body">
      <p class="text-body text-opacity-75 mb-0">
        SOP runbook editor (linked to alarm severity) lands in Phase 5. Backend
        contract lives in <code>klynx-api/docs/contracts/</code> as part of the
        kcontrol domain.
      </p>
    </div>
    <div class="card-arrow">
      <div class="card-arrow-top-left"></div>
      <div class="card-arrow-top-right"></div>
      <div class="card-arrow-bottom-left"></div>
      <div class="card-arrow-bottom-right"></div>
    </div>
  </div>
</DomainStarter>

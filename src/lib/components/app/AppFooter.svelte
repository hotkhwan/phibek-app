<!-- src/lib/components/app/AppFooter.svelte -->
<script lang="ts">
  import { m } from '$lib/i18n/messages'

  const year = new Date().getFullYear()
</script>

<div id="footer" class="app-footer">
  {m.appFooterCopyright({ year })}
</div>

---
name: phibek-ui
description: Use when building or porting any list/detail page in /home/phibek/app (SvelteKit 2 + Svelte 5 runes + cyber_admin v2.0 + PHIBEK CI). Captures the conventions we settled on for systemUsers/users so other pages stay consistent.
---

# PHIBEK UI Conventions

Stack: SvelteKit 2, Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`, snippets), Bootstrap 5.3 + cyber_admin v2.0 SCSS, paraglide-js v2 i18n. PHIBEK CI palette = Navy `#0F1C3F` / Oracle Gold `#C9952A` / Foresight Gold `#E8B84B` / Wisdom Cream `#F5F3EE`.

Reference templates (do **not** invent new layouts):
- list page → `cyber_admin_v2.0/template_html/src/html/page_products.html`
- summary cards → `cyber_admin_v2.0/template_html/src/html/ui_card.html`
- form modals → `Modal.svelte` + Bootstrap modal classes

Reference implementation = `src/routes/(app)/systemUsers/users/+page.svelte`. New pages should match its structure unless there's a documented reason not to.

## Page skeleton

```svelte
<div class="users-page d-flex flex-column" style="min-height: 100%;">
  <!-- 1. Breadcrumb -->
  <ul class="breadcrumb border-bottom px-3 py-2 m-0"> … </ul>

  <!-- 2. Page header: title + count + primary CTA (right) -->
  <div class="d-flex flex-wrap align-items-center px-3 py-3 gap-3">
    <div>
      <h1 class="page-header mb-0">{m.navUsers()}</h1>
      <small>{rows.length} user{rows.length === 1 ? '' : 's'} in system</small>
    </div>
    <button class="btn btn-outline-theme ms-auto" onclick={openCreate}>+ Add user</button>
  </div>

  <!-- 3. Summary cards row (ui_card pattern) -->
  <!-- 4. Scope toggle + filter + search -->
  <!-- 5. Toolbar: Export · Refresh · Clear (right-aligned per-page selector) -->
  <!-- 6. Table -->
  <!-- 7. Pagination -->
</div>
```

## Conventions

### State (always Svelte 5 runes — no `$:`)
```ts
let rows = $state<KlynxUser[]>([])
let loading = $state(false)
let search = $state('')
let pageIndex = $state(1)
const filtered = $derived(rows.filter(...))
const paged = $derived(filtered.slice(offset, offset + perPage))
```

### Server-side debounced search (350 ms)
```ts
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  pageIndex = 1
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => load(), 350)
}
```
Bind: `<input bind:value={search} oninput={onSearchInput} onkeydown={(e) => e.key === 'Enter' && (clearTimeout(searchTimer), load())} />`

### Cancellable load with stale-result discard
**Always** use this shape for list loaders. Required so overlapping calls (mount + workspace hydration + manual refresh) never strand `loading=true`.

```ts
let searchToken = 0
async function load() {
  loading = true
  errorMsg = ''
  const myToken = ++searchToken
  try {
    const { data, error } = await listX(params)
    if (myToken !== searchToken) return  // newer call won — drop stale data
    if (error) errorMsg = error.message
    rows = (data?.details?.items ?? []) as T[]
    pageIndex = 1
  } finally {
    if (myToken === searchToken) loading = false  // only newest clears spinner
  }
}
```

Anti-pattern: setting `loading = false` only on the success path or before the token check. An exception or stale-token return strands the spinner.

### Scope toggle (members vs system)
For pages that have both an org-scoped and platform-wide list (klynx-api: `/orgs/users/members` vs `/users`), default to org members and let the user toggle:
```ts
type ScopeMode = 'members' | 'system'
let scopeMode = $state<ScopeMode>('members')
function switchScope(next: ScopeMode) {
  if (scopeMode === next) return
  scopeMode = next
  pageIndex = 1
  load()
}
```
The org scope reads `get(activeWorkspaceId)`; if the store is empty, fall back to system scope automatically (don't require the user to toggle).

### Bulk actions, IDs, methods
Match klynx-api contracts exactly:
- delete from org: `PATCH /orgs/users/remove` body `{ users: [{ userId }] }` + `X-Active-Org` header (NOT `POST` with `{ userId }` — returns 405).
- After delete, optimistically remove the row (`rows = rows.filter(r => r.id !== removedId)`) so the list reflects state without a full refetch.
- Use `PATCH /:id` for edits, `POST` only for creates. `DELETE` only for hard deletes.

### Modals (Bootstrap via shared wrapper)
Use `$lib/components/shared/Modal.svelte` with `bind:open` and snippets — never instantiate `bootstrap.Modal` directly inside a page. Cancel button **must** close the modal AND any nested lightbox AND reset preview state in one handler:
```svelte
<button onclick={() => { lightboxOpen = false; resetAvatarPreview(); formOpen = false }}>
  Cancel
</button>
```
Confirm dialogs (delete) → use `ConfirmDialog.svelte`.

### Image preview + lightbox pattern
Compact thumbnail (≈7rem) with a magnifier overlay button that opens a full-size `Modal size="xl"`:
```svelte
<div class="user-avatar-thumb-wrap">
  <label class="user-avatar-drop" for="user-avatar">…</label>
  {#if avatarPreview}
    <button class="user-avatar-zoom" onclick={() => (lightboxOpen = true)}>
      <i class="bi bi-zoom-in"></i>
    </button>
  {/if}
</div>
<Modal bind:open={lightboxOpen} title="Profile image preview" size="xl"> … </Modal>
```

### Theme + chrome (do not break this)
- Header / sidebar / footer: solid background via `--phibek-chrome-bg: var(--bs-body-bg)` — never let them go transparent and bleed the cover image through. Set `z-index: 1020`, `backdrop-filter: none`.
- Page background cover is mode-aware: `defaultThemeCover()` returns `PhibekBG_dark.webp` or `PhibekBG_light.webp` from `data-bs-theme`. The theme panel must include a "Use default" reset button that clears `localStorage.appThemeCover`.
- Type scale lives in `src/scss/_phibek-overrides.scss` (xs/sm/base/md/lg/xl/2xl). Use the existing classes — do not introduce one-off `font-size` literals in components.
- Brand cover assets: `/img/logo/PhibekBG_dark.webp` and `/img/logo/PhibekBG_light.webp`. Legacy `.png` paths are normalized away in `src/lib/client/theme.ts` — don't reintroduce them.

### Style rules (parser gotchas)
- Inside Svelte `<style>` blocks, **always** `/* */` comments — `//` causes the postcss parser to fail.
- Keep tracing/observability concerns out of pages — they live in `$lib/utils/fetch.ts` (auto-injects Bearer + `X-Active-Org`).

### i18n
- `import { m } from '$lib/i18n/messages'` — keys live in `messages/en.json` + `messages/th.json`, merged via `bun run i18n:merge`, compiled via `bunx paraglide-js compile`.
- `bun run check` runs `i18n:compile && svelte-kit sync && svelte-check`. If `m.someKey` errors out as "does not exist", run `bun run check` once — paraglide regenerates the typed `_index.js`.

### File / route naming
- Files: camelCase (`publicMap.svelte`, never `public_map.svelte`).
- Route segments: camelCase (`/systemUsers/users`, never `/system-users/users`).
- API client modules: prefixed `klynxX.ts` to avoid clashing with stale `lib/api/user.ts` etc.

### Domain rebranding (Phibek vs klynx)
When porting a klynx page, rename the domain folder per memory `feedback_domain_naming`:
- `ksearch` → `aiSearch`
- `kwatch` → `iotWatch`
- `kcontrol` → `iotControl`

## Smoke checklist before reporting done

1. `bun run check` → 0 errors / 0 warnings.
2. Open the page in the dev pod, confirm:
   - List loads, spinner clears (no infinite loading).
   - Search debounces and hits the right endpoint.
   - Scope toggle switches between `/orgs/users/members` and `/users` cleanly.
   - Add / Edit / Delete modal flows close on Cancel without leaking state.
   - Theme panel "Use default" resets the cover.
   - Header/sidebar/footer remain solid in both light and dark mode.
3. If the change is layout-related, diff against the cyber_admin reference HTML.

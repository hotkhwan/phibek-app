<!-- src/routes/(app)/profile/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { auth } from '$lib/stores/auth'
  import {
    getProfile,
    updateProfile,
    type UserProfile,
    type UpdateProfileBody
  } from '$lib/api/profile'
  import { changeLocale, currentLocaleStore } from '$lib/i18nClient/setLanguage'
  import { m } from '$lib/i18n/messages'
  import { notify } from '$lib/stores/notify'

  let profile = $state<UserProfile | null>(null)
  let firstName = $state('')
  let lastName = $state('')
  let locale = $state<'en' | 'th'>('en')
  let loading = $state(false)
  let saving = $state(false)
  let loadError = $state('')

  async function load() {
    loading = true
    loadError = ''
    const data = await getProfile()
    loading = false
    if (!data) {
      loadError = m.profileLoadFailed()
      return
    }
    profile = data
    firstName = data.firstName ?? ''
    lastName = data.lastName ?? ''
    locale = (data.locale as 'en' | 'th') ?? 'en'
  }

  async function onSave(e: Event) {
    e.preventDefault()
    if (!profile) return
    saving = true
    const body: UpdateProfileBody = { firstName, lastName, locale }
    try {
      const updated = await updateProfile(body)
      profile = updated
      const u = auth.get().user
      if (u) {
        auth.updateUser({
          firstName: updated.firstName,
          lastName: updated.lastName,
          locale: updated.locale,
          fullName: `${updated.firstName ?? ''} ${updated.lastName ?? ''}`.trim() || u.username
        })
      }
      changeLocale(locale)
      notify.success(m.profileSaveSuccess())
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? m.profileSaveFailed()
      notify.error(m.profileSaveFailed(), msg)
    } finally {
      saving = false
    }
  }

  onMount(() => {
    setPageTitle(m.profileTitle())
    locale = $currentLocaleStore
    load()
  })
</script>

<div class="container-xxl p-3 p-lg-4">
  <div class="mb-4">
    <h1 class="page-header mb-1 fw-bold">{m.profileTitle()}</h1>
    <div class="text-body text-opacity-50 small">{m.profileSubtitle()}</div>
  </div>

  {#if loadError}
    <div class="alert alert-danger small mb-3">{loadError}</div>
  {/if}

  <div class="row g-3">
    <div class="col-lg-6">
      <div class="card h-100">
        <div class="card-header fw-bold">{m.profileAccountSection()}</div>
        <div class="card-body">
          <div class="text-body text-opacity-50 small mb-3">{m.profileAccountSectionDesc()}</div>

          <dl class="row g-2 mb-0">
            <dt class="col-sm-4 fw-semibold">{m.profileFieldUsername()}</dt>
            <dd class="col-sm-8 mb-0">{profile?.username ?? $auth.user?.username ?? '—'}</dd>

            <dt class="col-sm-4 fw-semibold">{m.profileEmail()}</dt>
            <dd class="col-sm-8 mb-0">{profile?.email ?? $auth.user?.email ?? '—'}</dd>

            <dt class="col-sm-4 fw-semibold">{m.profileFieldRole()}</dt>
            <dd class="col-sm-8 mb-0">{$auth.user?.role || '—'}</dd>
          </dl>
        </div>
        <div class="card-arrow">
          <div class="card-arrow-top-left"></div>
          <div class="card-arrow-top-right"></div>
          <div class="card-arrow-bottom-left"></div>
          <div class="card-arrow-bottom-right"></div>
        </div>
      </div>
    </div>

    <div class="col-lg-6">
      <div class="card h-100">
        <div class="card-header fw-bold">{m.profileInfoTitle()}</div>
        <div class="card-body">
          <form onsubmit={onSave}>
            <div class="mb-3">
              <label class="form-label" for="firstName">{m.profileFirstName()}</label>
              <input
                id="firstName"
                type="text"
                class="form-control"
                bind:value={firstName}
                placeholder={m.profileFirstNamePlaceholder()}
                disabled={loading}
              />
            </div>

            <div class="mb-3">
              <label class="form-label" for="lastName">{m.profileLastName()}</label>
              <input
                id="lastName"
                type="text"
                class="form-control"
                bind:value={lastName}
                placeholder={m.profileLastNamePlaceholder()}
                disabled={loading}
              />
            </div>

            <div class="mb-4">
              <label class="form-label" for="locale">{m.profileLocale()}</label>
              <select
                id="locale"
                class="form-select"
                bind:value={locale}
                disabled={loading}
              >
                <option value="en">{m.profileLocaleEn()}</option>
                <option value="th">{m.profileLocaleTh()}</option>
              </select>
            </div>

            <button
              type="submit"
              class="btn btn-outline-theme"
              disabled={loading || saving}
            >
              {#if saving}
                <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                {m.profileSaving()}
              {:else}
                <i class="bi bi-check2 me-1"></i>
                {m.profileSave()}
              {/if}
            </button>
          </form>
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
</div>

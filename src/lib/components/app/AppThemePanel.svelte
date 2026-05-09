<!-- src/lib/components/app/AppThemePanel.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { m } from '$lib/i18n/messages'
  import { appOptions } from '$lib/stores/appOptions'
  import { appVariables, generateVariables } from '$lib/stores/appVariables'
  import {
    applyTheme,
    defaultThemeCover,
    normalizeStoredThemeCover,
    normalizeThemeMode,
    resetThemeCover,
    saveThemeCover
  } from '$lib/client/theme'
  import { asset } from '$lib/utils/asset'

  type ThemeMode = 'dark' | 'light'
  type DirectionMode = 'ltr' | 'rtl'

  type ModeItem = {
    label: () => string
    img: string
    value: ThemeMode
  }

  type DirectionItem = {
    label: () => string
    icon: `bi bi-${string}`
    value: DirectionMode
  }

  type ThemeItem = {
    label: () => string
    bgClass: string
    themeClass: string
  }

  type CoverItem = {
    label: () => string
    image: string
  }

  const THEME_KEY = 'appThemeMode'
  const COLOR_KEY = 'theme-color'
  const DIRECTION_KEY = 'theme-rtl'
  const COVER_KEY = 'appThemeCover'

  let activeMode = $state<ThemeMode>('dark')
  let activeDirection = $state<DirectionMode>('ltr')
  let activeTheme = $state('') // '' = brand default (Foresight Gold via $theme)
  let activeCover = $state('') // '' = brand default (PhibekBG_dark/light per mode)

  const modeList: ModeItem[] = [
    {
      label: () => m.themePanelModeDark(),
      img: asset('/img/landing/mockup-1.jpg'),
      value: 'dark'
    },
    {
      label: () => m.themePanelModeLight(),
      img: asset('/img/landing/mockup-2.jpg'),
      value: 'light'
    }
  ]

  const directionList: DirectionItem[] = [
    {
      label: () => m.themePanelDirectionLtr(),
      icon: 'bi bi-text-left',
      value: 'ltr'
    },
    {
      label: () => m.themePanelDirectionRtl(),
      icon: 'bi bi-text-right',
      value: 'rtl'
    }
  ]

  const themeList: ThemeItem[] = [
    { label: () => m.themeColorPink(), bgClass: 'bg-pink', themeClass: 'theme-pink' },
    { label: () => m.themeColorRed(), bgClass: 'bg-red', themeClass: 'theme-red' },
    { label: () => m.themeColorOrange(), bgClass: 'bg-warning', themeClass: 'theme-warning' },
    { label: () => m.themeColorYellow(), bgClass: 'bg-yellow', themeClass: 'theme-yellow' },
    { label: () => m.themeColorLime(), bgClass: 'bg-lime', themeClass: 'theme-lime' },
    { label: () => m.themeColorGreen(), bgClass: 'bg-green', themeClass: 'theme-green' },
    { label: () => m.themeColorDefault(), bgClass: 'bg-theme', themeClass: '' },
    { label: () => m.themeColorCyan(), bgClass: 'bg-info', themeClass: 'theme-info' },
    { label: () => m.themeColorBlue(), bgClass: 'bg-primary', themeClass: 'theme-primary' },
    { label: () => m.themeColorPurple(), bgClass: 'bg-purple', themeClass: 'theme-purple' },
    { label: () => m.themeColorIndigo(), bgClass: 'bg-indigo', themeClass: 'theme-indigo' },
    { label: () => m.themeColorGray(), bgClass: 'bg-gray-200', themeClass: 'theme-gray-500' }
  ]

  const coverList: CoverItem[] = [
    // Brand-default (mode-aware) is rendered as the first swatch.
    { label: () => m.themeCoverDefault(), image: asset('/img/logo/PhibekBG_dark.webp') },
    { label: () => m.themeCover2(), image: asset('/img/logo/PhibekBG_light.webp') },
    { label: () => m.themeCover3(), image: asset('/img/ai/generated-1.jpg') },
    { label: () => m.themeCover4(), image: asset('/img/ai/generated-2.jpg') },
    { label: () => m.themeCover5(), image: asset('/img/ai/imagine-10.jpg') },
    { label: () => m.themeCover6(), image: asset('/img/ai/imagine-20.jpg') },
    { label: () => m.themeCover7(), image: asset('/img/ai/imagine-23.jpg') },
    { label: () => m.themeCover8(), image: asset('/img/landing/mockup-4.jpg') },
    { label: () => m.themeCover9(), image: asset('/img/gallery/widget-cover-1.jpg') }
  ]

  function togglePanel() {
    appOptions.update((o) => ({
      ...o,
      appThemePanelToggled: !o.appThemePanelToggled
    }))
  }

  function themeModeToggler(mode: ThemeMode) {
    activeMode = mode
    localStorage.setItem(THEME_KEY, mode)
    applyTheme(mode)
    $appVariables = generateVariables()
  }

  function themeColorToggler(themeClass: string) {
    activeTheme = themeClass
    localStorage.setItem(COLOR_KEY, themeClass)

    Array.from(document.body.classList).forEach((cls) => {
      if (cls.startsWith('theme-')) document.body.classList.remove(cls)
    })

    if (themeClass) document.body.classList.add(themeClass)
    $appVariables = generateVariables()
  }

  function themeCoverToggler(image: string) {
    activeCover = image
    saveThemeCover(image)
  }

  function themeCoverReset() {
    activeCover = ''
    resetThemeCover()
  }

  function themeDirectionToggler(direction: DirectionMode) {
    activeDirection = direction
    localStorage.setItem(DIRECTION_KEY, direction === 'rtl' ? '1' : '0')
    document.documentElement.setAttribute('dir', direction)
    $appVariables = generateVariables()
  }

  onMount(async () => {
    const bootstrap = await import('bootstrap')

    document
      .querySelectorAll<HTMLElement>('[data-bs-toggle="tooltip"]')
      .forEach((el) => new bootstrap.Tooltip(el))

    const storedMode = normalizeThemeMode(localStorage.getItem(THEME_KEY))
    if (storedMode === 'auto') {
      applyTheme('auto')
      activeMode = document.documentElement.getAttribute('data-bs-theme') === 'light' ? 'light' : 'dark'
    } else {
      activeMode = storedMode
    }
    activeDirection = localStorage.getItem(DIRECTION_KEY) === '1' ? 'rtl' : 'ltr'
    activeTheme = localStorage.getItem(COLOR_KEY) ?? activeTheme
    activeCover = normalizeStoredThemeCover(localStorage.getItem(COVER_KEY)) ?? activeCover

    if (storedMode !== 'auto') themeModeToggler(activeMode)
    themeDirectionToggler(activeDirection)
    themeColorToggler(activeTheme)
    if (activeCover) {
      themeCoverToggler(activeCover)
    } else {
      themeCoverReset()
    }
  })
</script>

<div class="app-theme-panel" class:active={$appOptions.appThemePanelToggled}>
  <div class="app-theme-panel-container">
    <a
      href="#/"
      aria-label={m.themePanelToggleAriaLabel()}
      class="app-theme-toggle-btn"
      onclick={(e) => {
        e.preventDefault()
        togglePanel()
      }}
    >
      <i class="bi bi-sliders"></i>
    </a>

    <div class="app-theme-panel-content">
      <div class="small fw-bold text-inverse mb-1">{m.themePanelDisplayMode()}</div>
      <div class="app-theme-panel-section mb-3">
        <div class="row gx-2">
          {#each modeList as mode}
            <div class="col-6">
              <a
                href="#/"
                class="app-theme-mode-link"
                class:active={mode.value === activeMode}
                onclick={(e) => {
                  e.preventDefault()
                  themeModeToggler(mode.value)
                }}
              >
                <div class="img">
                  <img src={mode.img} height="76" width="76" alt={mode.label()} />
                </div>
                <div class="text">{mode.label()}</div>
              </a>
            </div>
          {/each}
        </div>
      </div>

      <div class="small fw-bold text-inverse mb-1">{m.themePanelDirectionMode()}</div>
      <div class="app-theme-panel-section mb-3">
        <div class="row gx-2">
          {#each directionList as direction}
            <div class="col-6">
              <a
                href="#/"
                class="btn btn-sm btn-outline-light w-100"
                class:active={direction.value === activeDirection}
                onclick={(e) => {
                  e.preventDefault()
                  themeDirectionToggler(direction.value)
                }}
              >
                <i class={direction.icon}></i>
                {direction.label()}
              </a>
            </div>
          {/each}
        </div>
      </div>

      <div class="small fw-bold text-inverse mb-1">{m.themePanelThemeColor()}</div>
      <div class="app-theme-panel-section mb-3">
        <div class="app-theme-list">
          {#each themeList as theme}
            <div class="app-theme-list-item" class:active={theme.themeClass === activeTheme}>
              <a
                href="#/"
                aria-label={theme.label()}
                class="app-theme-list-link {theme.bgClass}"
                onclick={(e) => {
                  e.preventDefault()
                  themeColorToggler(theme.themeClass)
                }}
                data-bs-toggle="tooltip"
                data-bs-trigger="hover"
                data-bs-container="body"
                data-bs-title={theme.label()}
              >
                &nbsp;
              </a>
            </div>
          {/each}
        </div>
      </div>

      <div class="small fw-bold text-inverse mb-1 d-flex align-items-center justify-content-between">
        <span>{m.themePanelThemeCover()}</span>
        <button
          type="button"
          class="btn btn-link btn-sm p-0 text-uppercase"
          style="font-size: .65rem; letter-spacing: .08em;"
          onclick={themeCoverReset}
        >
          <i class="bi bi-arrow-counterclockwise me-1"></i>Use default
        </button>
      </div>
      <div class="app-theme-panel-section mb-0">
        <div class="app-theme-cover">
          {#each coverList as cover}
            <div
              class="app-theme-cover-item"
              class:active={cover.image === activeCover ||
                (activeCover === '' && cover.image === asset(defaultThemeCover()))}
            >
              <a
                href="#/"
                aria-label={cover.label()}
                class="app-theme-cover-link"
                style="background-image: url({cover.image});"
                onclick={(e) => {
                  e.preventDefault()
                  themeCoverToggler(cover.image)
                }}
                data-bs-toggle="tooltip"
                data-bs-trigger="hover"
                data-bs-container="body"
                data-bs-title={cover.label()}
              >
                &nbsp;
              </a>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

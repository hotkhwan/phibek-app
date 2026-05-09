<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { appTopNavMenus } from '$lib/stores/appTopNavMenus'
  import type { TopNavChild, TopNavMenu } from '$lib/types/navigation'

  /* ======================================================
   * Type guards
   * ====================================================== */
  function hasChildren(
    menu: TopNavMenu | TopNavChild
  ): menu is TopNavMenu & { children: TopNavChild[] } {
    return Array.isArray((menu as any).children)
  }

  /* ======================================================
   * Helpers
   * ====================================================== */
  function checkChildMenu(children?: TopNavChild[]): boolean {
    if (!children) return false
    return children.some((c) => c.url === page.url.pathname)
  }

  function slideUp(elm: HTMLElement | null) {
    if (!elm) return
    elm.style.display = 'none'
  }

  function slideToggle(elm: HTMLElement | null) {
    if (!elm) return
    elm.style.display = elm.style.display === 'block' ? 'none' : 'block'
  }

  /* ======================================================
   * Unlimited top nav render (LEGACY LOGIC – kept intact)
   * ====================================================== */
  function handleUnlimitedTopNavRender() {
    'use strict'

    function handleMenuButtonAction(
      element: HTMLElement,
      direction: 'next' | 'prev'
    ) {
      const obj = element.closest('.menu') as HTMLElement | null
      if (!obj) return

      const objStyle = window.getComputedStyle(obj)
      const bodyStyle = window.getComputedStyle(document.body)

      const targetCss =
        bodyStyle.getPropertyValue('direction') === 'rtl'
          ? 'margin-right'
          : 'margin-left'

      const marginLeft = parseInt(objStyle.getPropertyValue(targetCss), 10)

      const appTopNav = document.querySelector(
        '.app-top-nav'
      ) as HTMLElement | null
      if (!appTopNav) return

      const containerWidth = appTopNav.clientWidth - appTopNav.clientHeight * 2

      let totalWidth = 0
      let finalScrollWidth = 0

      const controlPrevObj = obj.querySelector<HTMLElement>(
        '.menu-control-start'
      )
      const controlNextObj = obj.querySelector<HTMLElement>('.menu-control-end')

      const controlPrevWidth = controlPrevObj?.clientWidth ?? 0
      const controlNextWidth = controlNextObj?.clientWidth ?? 0
      const controlWidth = controlPrevWidth + controlNextWidth

      const elms = Array.from(obj.querySelectorAll<HTMLElement>('.menu-item'))

      elms.forEach((elm) => {
        if (!elm.classList.contains('menu-control')) {
          totalWidth += elm.clientWidth
        }
      })

      switch (direction) {
        case 'next': {
          const widthLeft = totalWidth + marginLeft - containerWidth

          if (widthLeft <= containerWidth) {
            finalScrollWidth = widthLeft - marginLeft - controlWidth
            setTimeout(() => {
              controlNextObj?.classList.remove('show')
            }, 300)
          } else {
            finalScrollWidth = containerWidth - marginLeft - controlWidth
          }

          if (finalScrollWidth !== 0) {
            obj.style.transitionProperty = 'height, margin, padding'
            obj.style.transitionDuration = '300ms'

            if (bodyStyle.direction !== 'rtl') {
              obj.style.marginLeft = `-${finalScrollWidth}px`
            } else {
              obj.style.marginRight = `-${finalScrollWidth}px`
            }

            setTimeout(() => {
              obj.style.transitionProperty = ''
              obj.style.transitionDuration = ''
              controlPrevObj?.classList.add('show')
            }, 300)
          }
          break
        }

        case 'prev': {
          const widthLeft = -marginLeft

          if (widthLeft <= containerWidth) {
            controlPrevObj?.classList.remove('show')
            finalScrollWidth = 0
          } else {
            finalScrollWidth = widthLeft - containerWidth + controlWidth
          }

          obj.style.transitionProperty = 'height, margin, padding'
          obj.style.transitionDuration = '300ms'

          if (bodyStyle.direction !== 'rtl') {
            obj.style.marginLeft = `-${finalScrollWidth}px`
          } else {
            obj.style.marginRight = `-${finalScrollWidth}px`
          }

          setTimeout(() => {
            obj.style.transitionProperty = ''
            obj.style.transitionDuration = ''
            controlNextObj?.classList.add('show')
          }, 300)
          break
        }
      }
    }

    const nextBtn = document.querySelector<HTMLElement>(
      '[data-toggle="app-top-nav-next"]'
    )
    const prevBtn = document.querySelector<HTMLElement>(
      '[data-toggle="app-top-nav-prev"]'
    )

    nextBtn?.addEventListener('click', (e) => {
      e.preventDefault()
      handleMenuButtonAction(nextBtn, 'next')
    })

    prevBtn?.addEventListener('click', (e) => {
      e.preventDefault()
      handleMenuButtonAction(prevBtn, 'prev')
    })
  }

  /* ======================================================
   * Submenu logic (LEGACY – kept)
   * ====================================================== */
  function handleTopNavToggle(menus: HTMLAnchorElement[], forMobile = false) {
    menus.forEach((menu) => {
      menu.onclick = (e: MouseEvent) => {
        e.preventDefault()

        if (!forMobile || (forMobile && document.body.clientWidth < 768)) {
          const target = menu.nextElementSibling as HTMLElement | null

          menus.forEach((m) => {
            const other = m.nextElementSibling as HTMLElement | null
            if (other && other !== target) {
              slideUp(other)
              other.closest('.menu-item')?.classList.remove('expand')
              other.closest('.menu-item')?.classList.add('closed')
            }
          })

          slideToggle(target)
        }
      }
    })
  }

  function handleTopNavSubMenu() {
    const base = '.app-top-nav .menu > .menu-item.has-sub'
    const sub = ' > .menu-submenu > .menu-item.has-sub'

    const q = (s: string) =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>(s))

    handleTopNavToggle(q(`${base} > .menu-link`), true)
    handleTopNavToggle(q(`${base}${sub} > .menu-link`))
    handleTopNavToggle(q(`${base}${sub}${sub} > .menu-link`))
  }

  onMount(() => {
    handleUnlimitedTopNavRender()
    handleTopNavSubMenu()
  })
</script>

<!-- ====================================================== -->
<!-- TEMPLATE (unchanged)                                   -->
<!-- ====================================================== -->

<div id="top-nav" class="app-top-nav">
  <div class="menu">
    {#each $appTopNavMenus as menu (menu.text)}
      <div
        class="menu-item"
        class:has-sub={hasChildren(menu)}
        class:active={menu.url === page.url.pathname ||
          checkChildMenu(menu.children)}
      >
        <a href={menu.url ?? '#'} class="menu-link">
          {#if menu.icon}
            <span class="menu-icon">
              <i class={menu.icon}></i>
              {#if 'highlight' in menu && menu.highlight}
                <span
                  class="w-5px h-5px rounded-3 bg-theme position-absolute top-0 end-0 mt-3px me-3px"
                ></span>
              {/if}
            </span>
          {/if}
          <span class="menu-text">{menu.text}</span>
          {#if hasChildren(menu)}
            <span class="menu-caret"><b class="caret"></b></span>
          {/if}
        </a>

        {#if hasChildren(menu)}
          <div class="menu-submenu">
            {#each menu.children as child (child.text)}
              <div
                class="menu-item"
                class:has-sub={hasChildren(child)}
                class:active={page.url.pathname === child.url}
              >
                <a href={child.url} class="menu-link">
                  <span class="menu-text">{child.text}</span>
                </a>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}

    <div class="menu-item menu-control menu-control-start">
      <a
        href="#/"
        class="menu-link"
        data-toggle="app-top-nav-prev"
        aria-label="Prev"><i class="bi bi-caret-left"></i></a
      >
    </div>

    <div class="menu-item menu-control menu-control-end">
      <a
        href="#/"
        class="menu-link"
        data-toggle="app-top-nav-next"
        aria-label="Next"><i class="bi bi-caret-right"></i></a
      >
    </div>
  </div>
</div>

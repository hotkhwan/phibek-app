// src/lib/stores/appOptions.ts
import { writable } from 'svelte/store'

export type AppOptions = {
	appBoxedLayout: boolean
	appSidebarToggled: boolean
	appSidebarCollapsed: boolean
	appSidebarMobileToggled: boolean
	appSidebarMobileClosed: boolean
	appSidebarHide: boolean
	appHeaderToggled: boolean
	appHeaderSearchToggled: boolean
	appHeaderHide: boolean
	appContentFullHeight: boolean
	appContentFullWidth: boolean
	appContentClass: string
	appTopNav: boolean
	appFooter: boolean
	appFooterFixed: boolean
	appThemePanelToggled: boolean
}

export const appOptions = writable<AppOptions>({
	appBoxedLayout: false,
	appSidebarToggled: false,
	appSidebarCollapsed: false,
	appSidebarMobileToggled: false,
	appSidebarMobileClosed: false,
	appSidebarHide: false,
	appHeaderToggled: false,
	appHeaderSearchToggled: false,
	appHeaderHide: false,
	appContentFullHeight: false,
	appContentFullWidth: false,
	appContentClass: '',
	appTopNav: false,
	appFooter: false,
	appFooterFixed: false,
	appThemePanelToggled: false
})

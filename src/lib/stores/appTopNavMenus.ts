// src/lib/stores/appTopNavMenus.ts
import { writable } from 'svelte/store'
import { m } from '$lib/i18n/messages'

type TopNavMenu = {
	url?: string
	icon?: string
	text: () => string
	children?: TopNavMenu[]
}

export const appTopNavMenus = writable<TopNavMenu[]>([
	{
		url: 'dashboard',
		icon: 'bi bi-speedometer2',
		text: () => m.navDashboard()
	},
	{
		url: 'ingest/details',
		icon: 'bi bi-collection',
		text: () => m.navEvents()
	},
	{
		url: 'profile',
		icon: 'bi bi-person-circle',
		text: () => m.navProfile()
	},
	{
		url: 'settings',
		icon: 'bi bi-gear',
		text: () => m.navSettings()
	}
])

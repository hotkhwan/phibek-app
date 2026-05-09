import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const rawBase = process.env.PUBLIC_APP_BASE_PATH || ''
const basePath = rawBase === '/' ? '' : rawBase.replace(/\/+$/, '')

/** @type {import('@sveltejs/kit').Config} */
const config = {

	preprocess: vitePreprocess(),

	vite: {
		define: {
			'import.meta.env.PUBLIC_APP_BASE_PATH': JSON.stringify(rawBase)
		}
	},

	kit: {
		alias: {
			$paraglide: 'src/paraglide'
		},

		adapter: adapter(),

		paths: {
			base: basePath
		}
	}
}


export default config

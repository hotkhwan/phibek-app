import { defineConfig, loadEnv } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '')
	const port = Number(env.PUBLIC_APP_BASE_PORT || env.PORT || 5173)

	return {
		define: {
			__APP_VERSION__: JSON.stringify(pkg.version)
		},
		plugins: [
			sveltekit(),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/i18n',
				strategy: ['localStorage', 'cookie', 'baseLocale']
			})
		],
		server: {
			host: '0.0.0.0',
			port,
			strictPort: true,
			allowedHosts: true,
			watch: { usePolling: true, interval: 300 }
		},
		preview: {
			host: '0.0.0.0',
			port,
			strictPort: true
		}
	}
})

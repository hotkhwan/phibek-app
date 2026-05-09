// src/lib/api/authGuard.ts
// Centralized auth guard: redirects to login when session is expired (401/403)
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'

const basePath = (PUBLIC_APP_BASE_PATH ?? '/aisom').replace(/\/$/, '')

/**
 * Check API response for auth errors (401/403).
 * If detected, redirect to login page and throw to stop further execution.
 * Call this after fetch() but before processing the response body.
 */
export function guardAuth(res: Response): void {
	if (res.status === 401 || res.status === 403) {
		if (typeof window !== 'undefined') {
			// Prevent infinite redirect loop: if we just came from auth, don't redirect again
			const url = new URL(window.location.href)
			if (url.searchParams.has('_auth_retry')) {
				throw { code: 'SESSION_EXPIRED', message: 'Session expired after re-auth', status: false }
			}
			const returnTo = window.location.pathname + window.location.search
			const sep = returnTo.includes('?') ? '&' : '?'
			window.location.href = `${basePath}/auth/session/start?returnTo=${encodeURIComponent(returnTo + sep + '_auth_retry=1')}`
		}
		throw { code: 'SESSION_EXPIRED', message: 'Session expired', status: false }
	}
}

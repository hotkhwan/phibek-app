// src/routes/+page.server.ts
// Root → redirect to dashboard (if signed in) or landing (otherwise) on the
// server so the user never sees a client-only loading flash.
import { redirect } from '@sveltejs/kit'
import { env } from '$env/dynamic/public'
import type { PageServerLoad } from './$types'

const RAW_BASE = (env.PUBLIC_APP_BASE_PATH ?? '').replace(/\/+$/, '')
const BASE = RAW_BASE === '/' ? '' : RAW_BASE

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) {
    throw redirect(307, `${BASE}/dashboard`)
  }
  throw redirect(307, `${BASE}/landing`)
}

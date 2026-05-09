// src/routes/(app)/+layout.server.ts
import type { RequestEvent } from '@sveltejs/kit'

export const load = (event: RequestEvent) => {
  return {
    user: event.locals.user
  }
}


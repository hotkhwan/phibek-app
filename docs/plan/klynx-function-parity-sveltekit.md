# Klynx Function Parity For SvelteKit

## Scope

Bring the PHIBEK SvelteKit shell to functional parity with `/home/klynx/klynx` while keeping the Cyber Admin visual shell from `cyber_admin_v2.0`.

Primary domains:
- user
- permission and menu visibility
- device cameras
- edge devices
- resource groups
- organization
- org unit
- ingest
- dashboard / live / map / video wall / BI dashboard / watchman / AI search / IoT control

## Current State

The SvelteKit app already has first-pass routes and API clients for most domains, but it is not 100% parity with the Nuxt source.

Known gaps from the first inventory:
- Header search overlay uses the wrong CSS hook and overlaps the dashboard header/status area.
- Menu visibility is currently static and does not honor `GET /kapi/orgs/effectiveAccess` like Nuxt.
- Several Nuxt routes are missing or collapsed in SvelteKit:
  - `/ingest/events`
  - `/systemUsers/permissions/menu`
  - `/systemUsers/permissions/api`
  - `/systemUsers/permissions/resource`
  - `/edge-ai/summary-report`
  - `/edge-ai/summary/people-counting`
  - `/edge-ai/summary/people-blacklist`
  - `/edge-ai/summary/events-notification`
  - create/edit/delete child routes for cameras, edge, users, police, floor plans, and licenses
- Dynamic edge-device menu items from `/kapi/system/edge` are not yet rendered in the sidebar.
- Some Svelte API clients still use mixed base/header conventions and must be normalized against the Nuxt `useApi` behavior.

## Ownership Model

Frontend owner: this SvelteKit repo.

Backend owner: `klynx-api` remains the default owner for `/kapi` contracts and effective access behavior.

System of record:
- menu visibility and capabilities: `klynx-api` effective access response
- user/org/permission/resource/device data: existing `klynx-api` endpoints
- device/camera identity and sync state: `gateway-api/device_management`, projected into Klynx

## Contract Summary

No new backend contract is introduced in this pass. The SvelteKit app consumes existing `klynx-api` endpoints already used by `/home/klynx/klynx`.

Critical existing contract:
- `GET /kapi/orgs/effectiveAccess`
- response `details.visibleMenuIds`
- response `details.platformCapabilities`
- response `details.orgCapabilities`

## Rollout Order

1. Fix layout regressions that block visual use.
2. Add effective access store and apply static menu hiding.
3. Restore route coverage with redirects/stubs for missing Nuxt paths.
4. Port each domain page from Nuxt to SvelteKit in batches:
   - users / org / orgUnit / permissions
   - cameras / edge / resource groups
   - ingest
   - floor plans / live / map / dashboard surfaces
5. Normalize API clients and headers.
6. Run typecheck/build and browser smoke tests.

## Rollback

UI-only changes can be reverted by restoring `AppHeader.svelte`, `appSidebarMenus.ts`, and related route files.

## Decision Points

- Whether missing create/edit/delete paths should be full native Svelte pages or routed back to list pages until each domain is ported.
- Whether dynamic edge SSO links should open in the same tab or a new tab, matching Nuxt behavior.

## Validation Checklist

- `bun run check`
- `bun run build`
- smoke `/phibek/landing`
- smoke `/phibek/dashboard`
- smoke representative protected routes after login:
  - `/systemUsers/users`
  - `/systemUsers/permissions/menu`
  - `/systemDevices/cameras`
  - `/systemDevices/groups`
  - `/systemDevices/edge`
  - `/ingest/events`

# Edge/Camera Contract Follow-Up — 2026-05-20

## Source Contracts

- `/home/klynx/klynx-api/docs/contracts/device-camera-domain.md` §5.1, §5.2, §5.6, §10.
- `/home/klynx/klynx-api/docs/contracts/device-camera-domain.md` §5.3 and §5.4 for the camera usage report/export surface.
- `/home/klynx/klynx-api/docs/contracts/camera-gw-managed-overlay.md` §5.3, §6, §7, and §7.6/§10 admin `gwSyncStatus` visibility.
- `/home/klynx/klynx-api/docs/contracts/permission-profile.md` §5.1, §5.7, §9.4, and §11.
- `/home/klynx/klynx-api/docs/contracts/dashboard-camera-scope-filter.md` §5.1 and §9.
- `/home/klynx/klynx-api/docs/contracts/kcontrol-gw-managed-registry.md` §4.4.
- `/home/klynx/klynx-api/docs/contracts/media-relay-ffmpeg-fallback.md` §3 and §12: stream response shape is unchanged; no PHIBEK UI schema change required.

## Touched Screens

- `/systemDevices/cameras`
- `/systemUsers/permissions?tab=resource`
- `/dashboard`
- `/dashboard/camera-usage`
- `/iotControl`

## FE Behavior

- Camera list sends the documented `mapVisibility` query param and treats BE visibility as authoritative.
- Camera list exposes org-wide `POST /resources/camera/syncMonitor` and per-camera `POST /resources/camera/{id}/sync`.
- Camera list exposes the admin `GET /admin/system/gwSyncStatus` triage check without blocking the table.
- Per-camera sync is only shown for rows with `externalSource`, matching the `NOT_SYNCABLE` guard for local cameras.
- GW/EdgeAI projection state is rendered from `externalSource.provider`, `externalSource.sourceFamily`, and `externalSource.gwSyncStatus`.
- Resource permission profiles send `edges` and `memberIdsByOU`; response-only keys (`edgeIds`, `cameraIds`) remain read-only.
- Existing per-OU `memberIdsByOU` maps are preserved unless the operator changes the global user narrowing selection.
- Dashboard now sends `scope=all|owner|public` explicitly on `/analytics/live/overview`.
- Camera Usage consumes `GET /admin/analytics/cameraUsage`, preserves the contract field names (`id`, `lastUsedAt`, `resourceGroups`), and exports via the documented XLSX/CSV endpoint.
- IoT Control exposes the operator `GET /admin/system/kctrlRegistryDrift` summary as a triage action.

## Fallback / Error UX

- `syncMonitor` shows warning toast when `details.failed > 0`, not a hard error, per best-effort contract.
- Per-camera sync parses `details.status` for `synced`, `skipped`, or `failed`; upstream failures are surfaced as warning toasts because they are `200` outcomes by contract.
- Local cameras without `externalSource` hide the per-camera sync action.
- Permission profile saves block FE-side when user narrowing is selected without any selected org unit because `memberIdsByOU` must be keyed by bound OU ids.
- Camera Usage treats `lastUsedAt=null` and `(lat,lng)=(0,0)` as `-`, and shows the contract `truncated` warning before export.
- Export `RESULT_TRUNCATED` and other backend errors are surfaced as toasts; no partial file is fabricated client-side.
- KControl registry drift is a platform-admin/operator diagnostic; permission failures show the backend error instead of guessing fallback state.

## Smoke Checklist

- `bun run check`
- `bun run lint`
- `bun run build`
- `git diff --check`
- HTTP smoke for `/phibek/systemDevices/cameras` and `/phibek/systemUsers/permissions?tab=resource`.
- HTTP smoke for `/phibek/dashboard`, `/phibek/dashboard/camera-usage`, and `/phibek/iotControl`.

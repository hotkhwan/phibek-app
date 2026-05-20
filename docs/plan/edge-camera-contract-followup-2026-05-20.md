# Edge/Camera Contract Follow-Up — 2026-05-20

## Source Contracts

- `/home/klynx/klynx-api/docs/contracts/device-camera-domain.md` §5.1, §5.2, §5.6, §10.
- `/home/klynx/klynx-api/docs/contracts/camera-gw-managed-overlay.md` §5.3, §6, §7.
- `/home/klynx/klynx-api/docs/contracts/permission-profile.md` §5.1, §9.4, §11.
- `/home/klynx/klynx-api/docs/contracts/media-relay-ffmpeg-fallback.md` §3 and §12: stream response shape is unchanged; no PHIBEK UI schema change required.

## Touched Screens

- `/systemDevices/cameras`
- `/systemUsers/permissions?tab=resource`

## FE Behavior

- Camera list sends the documented `mapVisibility` query param and treats BE visibility as authoritative.
- Camera list exposes org-wide `POST /resources/camera/syncMonitor` and per-camera `POST /resources/camera/{id}/sync`.
- Per-camera sync is only shown for rows with `externalSource`, matching the `NOT_SYNCABLE` guard for local cameras.
- GW/EdgeAI projection state is rendered from `externalSource.provider`, `externalSource.sourceFamily`, and `externalSource.gwSyncStatus`.
- Resource permission profiles send `edges` and `memberIdsByOU`; response-only keys (`edgeIds`, `cameraIds`) remain read-only.
- Existing per-OU `memberIdsByOU` maps are preserved unless the operator changes the global user narrowing selection.

## Fallback / Error UX

- `syncMonitor` shows warning toast when `details.failed > 0`, not a hard error, per best-effort contract.
- Per-camera sync parses `details.status` for `synced`, `skipped`, or `failed`; upstream failures are surfaced as warning toasts because they are `200` outcomes by contract.
- Local cameras without `externalSource` hide the per-camera sync action.
- Permission profile saves block FE-side when user narrowing is selected without any selected org unit because `memberIdsByOU` must be keyed by bound OU ids.

## Smoke Checklist

- `bun run check`
- `bun run lint`
- `bun run build`
- `git diff --check`
- HTTP smoke for `/phibek/systemDevices/cameras` and `/phibek/systemUsers/permissions?tab=resource`.

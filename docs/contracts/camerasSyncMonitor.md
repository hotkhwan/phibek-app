# Cameras Sync Monitor Contract

**Date:** 2026-04-25
**Status:** Superseded by [`device-camera-domain.md`](./device-camera-domain.md) on 2026-05-04 — `POST /resources/camera/syncMonitor` (alias `/resources/cameras/syncMonitor`) merged into one Camera Domain operations contract per the new domain/flow grouping rule (`docs/contracts/README.md`). Full rev 1 / rev 2 / rev 3 revision history preserved verbatim in §3 of the merged contract: rev 2 router-only fix (commonmon Service ClusterIP-only — server-to-server endpoints un-authed); rev 3 adapter forwarding fix (commonmongw.RegisterCamera plumbs userJWT + activeOrg); idempotency rule (`POST /commonmon/cameras` is upsert-style); klynx-api → commonmon authority direction; bounded fan-out (cap 8); response semantics (`registered` / `skipped` / `failed`; partial failure does NOT raise HTTP error); error codes (`MONITOR_NOT_CONFIGURED`, `UNAUTHORIZED`, `INTERNAL_SERVER_ERROR`); 4 FE pages where the button surfaces; and the 2 follow-ups (commonmon image rebuild + goroutine JWT plumbing) all preserved in §5.2 / §3 / §11. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Tier:** Lite (no separate `docs/plan/` artifact — wrapper around existing commonmon registration)
**Applies To Repos:** `klynx-api`, `klynx` (frontend)
**Contract Type:** `REST`
**Version:** `v1`

## Revision history

- **rev 1 (2026-04-25):** initial — `POST /resources/camera/syncMonitor` + FE button.
- **rev 2 (2026-04-25):** discovered first-call returned `failed=4` for all 4 cameras.
  Root cause: `POST /commonmon/cameras` and `DELETE /commonmon/cameras/:id` were
  registered behind `AuthBearer + ActiveOrg`, but the outbound `commonmongw.RegisterCamera`
  / `DeregisterCamera` adapter never sent `Authorization` or `X-Active-Org` headers.
  All Create / Update / BulkCreate / Delete commonmon registrations had been
  silently 401-ing since commit `2983421` (2026-04-24). Initial fix: reorganized
  `router/commonmon.go` so only the user-scoped GET `/cameraStatuses/*` reads
  remain authed; the server-to-server register/deregister endpoints run without
  auth (commonmon Service is ClusterIP-only — no external Ingress, callers are
  klynx-api in-cluster).
- **rev 3 (2026-04-25):** rev 2's router-only fix did not roll out — production
  commonmon pod runs an old image (`commonmon:1.0.7`, 5d19h uptime per kubectl)
  that still requires auth, so klynx-api kept getting 401. Added forwarding in
  `commonmongw.RegisterCamera` / `DeregisterCamera`: both now accept `userJWT`
  and `activeOrg` parameters and set them on the outbound request. The
  `CameraMonitorRegistrar` interface in `devicesvc` matches. SyncMonitor (the
  only caller with a request JWT in scope) plumbs the bearer all the way through;
  Create / Update / BulkCreate / Delete still pass empty strings — they will
  start working once commonmon is rebuilt with rev 2's router change. Plumbing
  JWT through the goroutine paths is a follow-up (see "Follow-ups" below).

## Follow-ups (not blocking sync button)

1. Rebuild and roll out commonmon image with the rev 2 router change. Once
   live, the auth headers we now send become harmless extras and the goroutine
   paths (Create / Update / BulkCreate / Delete) start succeeding too.
2. Plumb userJWT through `CreateCameraInput` / `PatchCameraInput` so the
   goroutine paths can also call commonmon successfully on stacks that still
   require auth. Lower priority — once (1) ships, (2) is no longer needed.

---

## 1. Purpose

Defines `POST /resources/camera/syncMonitor` (alias `/resources/cameras/syncMonitor`),
an org-scoped recovery affordance that re-registers every non-deleted camera in the
caller's active org with the commonmon probe scheduler.

Solves the recurring case where cameras stay at `monitorState=unknown` even though
their RTSP URL is reachable, because the scheduler fell out of sync with the
device collection. Known triggers:

- Bulk imports performed before commit `2983421` (lifecycle sync fix on 2026-04-24)
  did not call `RegisterCamera`. Affected cameras stay unknown until the next
  commonmon process restart re-runs the seed flow.
- klynx-api's `commonmongw.RegisterCamera` is best-effort (warn-only on failure).
  If commonmon was offline during a CRUD burst, the affected cameras silently
  fall out of the scheduler.

This endpoint replaces the previous "restart commonmon process" workaround with
a self-service action the org administrator can trigger from the UI.

---

## 2. Surface

| Type | Path | Method | Auth | Handler |
|---|---|---|---|---|
| REST | `/resources/camera/syncMonitor` | `POST` | `Bearer + X-Active-Org` | `CameraController.SyncMonitor` |
| REST | `/resources/cameras/syncMonitor` | `POST` | `Bearer + X-Active-Org` | `CameraController.SyncMonitor` (path alias) |

The handler reads `tenantId` and `activeOrg` from middleware locals. There is no
request body. The path is org-scoped — callers cannot sync another org's cameras.

### 2.1 Request

```http
POST /resources/camera/syncMonitor HTTP/1.1
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

No body.

### 2.2 Response (200 OK)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "camera monitor sync complete",
  "details": {
    "registered": 12,
    "skipped": 1,
    "failed": 0
  }
}
```

| Field | Meaning |
|---|---|
| `registered` | `commonmon.RegisterCamera` calls that returned 2xx |
| `skipped`    | Cameras with no RTSP URL — commonmon rejects empty `rtspUrl`, so klynx-api filters them out before the call |
| `failed`     | Calls that returned an error (commonmon down, timeout, non-2xx) |

### 2.3 Error responses

| Status | Code | When |
|---|---|---|
| `401` | `UNAUTHORIZED` | missing / invalid bearer |
| `503` | `MONITOR_NOT_CONFIGURED` | `COMMONMON_BASE_URL` is unset on this klynx-api process — no registrar wired |
| `500` | `INTERNAL_SERVER_ERROR` | mongo query failed, unrecoverable iteration error |

`failed > 0` does **not** raise an HTTP error. The endpoint is best-effort — partial
failure is reported in-body so the UI can surface it. Callers that need a strict
"all or nothing" semantics must inspect the body.

---

## 3. Behavior

1. Reject with `MONITOR_NOT_CONFIGURED` if `CameraService.monitorRegister` is nil.
2. Iterate `cameras` collection where `orgId == activeOrg AND isDeleted != true`
   via `CameraRepo.IterateOrgActive`.
3. For each camera, resolve RTSP URL: prefer `cam.url`, fall back to `cam.streamUrl`.
   If both empty → increment `skipped`, do not call commonmon.
4. Call `commonmongw.RegisterCamera(camId, orgId, "", "", url)` with bounded
   fan-out (cap 8, reused from `monitorRegisterFanOutLimit`) so a large org does
   not burst commonmon.
5. Wait for all in-flight calls to complete before returning. Per-call success
   increments `registered`; per-call error increments `failed`.

### 3.1 Idempotency

`commonmon POST /commonmon/cameras` is upsert-style — repeat calls with the same
`cameraId` re-write the schedule entry and config blob. Calling syncMonitor
multiple times in a row is safe.

### 3.2 Authority

This endpoint is the **klynx-api → commonmon** direction only. It does not
modify the `cameras` collection. The canonical store of camera identity remains
`cameras`; commonmon's Redis schedule is a projection that this endpoint refreshes.

---

## 4. Frontend integration

The button calls this endpoint and displays a toast with `registered / skipped / failed`.
Pages to surface the action on (per agreed scope 2026-04-25):

- `/feature/systemDevices/cameras` — primary location, near "เพิ่มกล้อง" / "Bulk import"
- `/feature/biDash` — when camera health charts show stale data
- `/feature/videowall` — when tiles are stuck on unknown
- `/feature/floorPlans` — when placed cameras show monitor=unknown

Frontend is owned by the user. Backend exposes only the REST surface above.

---

## 5. Related artifacts

- Commit `2983421` (2026-04-24) — wired Create / Update / BulkCreate / Delete
  to commonmon. This contract is the manual-recovery counterpart for cameras
  that pre-date that fix or whose registration silently failed.
- [docs/contracts/deploymentProfile.md](deploymentProfile.md) — `MONITOR_NOT_CONFIGURED`
  is expected on deployments where commonmon is not co-located (rare; consult
  the deployment profile resolver for current expectations).
- `internal/gateways/commonmongw/client.go` — `RegisterCamera` adapter this
  endpoint delegates to.
- `cmd/commonmon/main.go:131-162` — the original startup seed flow this endpoint
  effectively re-runs on demand for one org.

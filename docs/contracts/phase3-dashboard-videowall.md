# Contract — Phase 3 (Dashboard + Video Wall + Stream Security)

**Plan:** [docs/plan/done/phase3-dashboard-videowall.md](../plan/done/phase3-dashboard-videowall.md)
**Owner:** klynx-api
**Status:** v0.2 — 3a.1 reframed as staged-flag rollout (PR #104 / v4.9.0); §1.5 + §4 revised
**Versions affected:**
- **3a.1** (staged across v4.9.0 → v4.10.x): `CameraDTO` redaction shipped behind env flag `STREAM_SECURITY_REDACT_CAMERADTO` (default **OFF**). Flag-OFF default = `URL` / `StreamURL` userinfo stripped (defense-in-depth, **no shape change**, FE direct readers keep working). Flag-ON = `IP` / `User` / `URL` / `StreamURL` zeroed → `omitempty` drops the keys (final hard-omit shape FE migrates to). FE composes playback via `GET /media/stream/{camId}` exclusively; admin pre-fill via `GET /admin/cameras/{id}/credentials` (platform-admin only). Flag flip + flag removal sequence in §1.5.
- **3a.4** (already shipped — documented here for canonical reference): `GET /media/stream/{camId}` issues a per-session `playUrl` valid for `streamSessionDefaultSeconds` (default 60s); `playUrl` is single-viewer-bound (per `userId` for authenticated, per `clientIp` for public).
- **3b** (target v4.8.0 or v4.8.1 depending on rollout order): new `GET /dashboard/counters` aggregating cameras-by-state + events-by-window + alerts-by-priority.

---

## 1. Endpoint Surface

### 1.1 `GET /kapi/media/stream/{camId}` — authenticated playback (already shipped, canonical reference)

Per D8 in the plan: `GET` is the v1 canonical method. POST migration deferred to v2 with FE coordinated rename.

**Auth:** Bearer JWT. Caller must have Permify `view` on the camera (group-mediated, direct, or descendant — resolved via `MemberAccessService.ResolveViewableEntityIDs`). Cross-org cameras allowed when `mapVisibility ∈ {"public", "forcePublic"}`.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `X-Active-Org: <orgId>` (required)

**Path parameters:**
- `camId` (string, required) — UUID of the camera.

**Side effects (for the reader):**
- Issues a `media_stream_sessions` document with `viewerType="authenticated"`, `userId=<callerUserId>`, `playToken=<random hex>`, `expiresAt=now + streamSessionDefaultSeconds`.
- Triggers ZLM proxy ensure via `mediagw.Client.EnsureStream(app="live", streamKey, sourceURL)` — sourceURL is **internal-only** and never returned in the response.
- Pre-registers + post-registers the stream in `cacheklive` for ZLM `onPlay` hook validation.

#### Success response (200)

```json
{
  "code": "SUCCESS",
  "message": "stream ensured",
  "status": true,
  "details": {
    "camId": "cam-uuid-1",
    "streamId": "cam-uuid-1",
    "app": "live",
    "name": "Lobby Camera",
    "sessionId": "session-uuid",
    "playUrl": "https://media.k-lynx.com/live/cam-uuid-1.flv?token=<playToken>",
    "expiresAt": "2026-05-01T16:30:00Z",
    "ttlSec": 60,
    "existedBefore": false,
    "createdNow": true,
    "ready": true
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `camId` | string | from `info.CamID`; mirrors path param |
| `streamId` | string | ZLM stream key (currently `==camId`) |
| `app` | string | always `"live"` for authenticated path |
| `name` | string | camera display name (no creds) |
| `sessionId` | string | UUID of the issued `media_stream_sessions` document |
| `playUrl` | string | playback URL with `?token=<playToken>` query — single-viewer-bound, expires at `expiresAt` |
| `expiresAt` | RFC3339 UTC | session expiration timestamp |
| `ttlSec` | int | seconds until `expiresAt` (convenience for FE rotation timer) |
| `existedBefore` | bool | true if ZLM already had the stream registered |
| `createdNow` | bool | true if this request created the upstream proxy |
| `ready` | bool | ZLM `Ready` flag — false means upstream not yet pulling |

#### Error contract

| HTTP | code | message | Cause |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `"camId is required"` | empty path param |
| 400 | `BAD_REQUEST` | `"camera has no valid RTSP configuration"` | `mapsvc.ErrCameraNoRTSP` |
| 403 | `FORBIDDEN` | `"camera does not belong to the active org"` | `mapsvc.ErrCameraForbidden` |
| 403 | `FORBIDDEN` | `"camera is not active"` | `mapsvc.ErrCameraNotActive` |
| 404 | `NOT_FOUND` | `"camera not found"` | `mapsvc.ErrCameraNotFound` |
| 500 | `MEDIA_NOT_CONFIGURED` | `"media gateway is not configured"` | media gateway client unset |
| 500 | `STREAM_REGISTER_FAILED` | `"stream could not be registered in media server"` | ZLM accepted call but neither created nor existed-before |
| 500 | `INTERNAL` | wrapped err | all other `client.EnsureStream` / `IssueSession` failures |

**Sentinel test (3a.6):** `playUrl` MUST NOT match `rtsp://[^/]+@` regex; response body MUST NOT contain the camera's stored `User` or `Password` fields.

#### Session rotation (FE flow)

```
t=0s         FE calls GET /media/stream/{camId} → playUrl, expiresAt=t+60s
t=0..50s     FE plays video via playUrl
t=55s        FE re-fetches GET /media/stream/{camId} (5s before expiry)
             → new sessionId, new playUrl, expiresAt=t+115s
t=60s        old playUrl rejected by ZLM (token expired)
t=60..115s   FE plays via new URL
```

Recommended FE refresh window: **`max(5s, ttlSec / 12)` before `expiresAt`**. Keeps a buffer for network jitter + ZLM token validation drift.

---

### 1.2 `GET /kapi/media/stream/public/{camId}` — public playback (already shipped, canonical reference)

Same shape as §1.1 but with these differences:

- **Auth:** Bearer optional (anonymous allowed). When Bearer provided, caller still must satisfy public visibility.
- **Camera precondition:** `mapVisibility="public"` (or `"forcePublic"`) on the camera doc. Private cameras 403 even with auth.
- **Session viewer type:** `viewerType="public"`, `userId=""`, binding falls back to `clientIP`.

#### Success response (200)

Same JSON shape as §1.1 with `app="public"` instead of `"live"`. (Confirm — the actual app value used in `controllers/mediapi/publicStream.go` may differ. Implementation reference is authoritative.)

#### Error contract

Same as §1.1 plus:
- 403 `FORBIDDEN` `"camera is not public"` — when caller has Bearer but camera isn't public.

---

### 1.3 `GET /kapi/admin/cameras/{camId}/credentials` (NEW — Phase 3a.1, v4.8.0)

**Purpose:** when D7 ships hard-omit on `CameraDTO`, the camera-import / camera-edit admin UI loses its ability to pre-fill the `User` / `URL` fields from `GET /resources/cameras/{id}`. This new endpoint replaces that pre-fill path with an explicit admin-only surface.

**Auth:** Bearer JWT. **Strict role gate** — `platformRole=administrator` required; non-administrator (even with Permify `organization:manage`) gets 403. The platform admin role is the only role expected to view raw RTSP creds.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `X-Active-Org: <orgId>` (required)

**Path parameters:**
- `camId` (string, required)

#### Success response (200)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "camId": "cam-uuid-1",
    "user": "admin",
    "url": "rtsp://192.168.1.100:554/stream",
    "streamUrl": "rtsp://192.168.1.100:554/profile1"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `user` | string (omitempty) | camera username (plaintext) |
| `url` | string (omitempty) | primary RTSP URL — **userinfo segment stripped** (see "URL sanitization" below). Creds are stored separately in the encrypted `password` field on the camera doc and never embedded in this response. |
| `streamUrl` | string (omitempty) | alternate stream URL when set on the camera doc; same sanitization applied. **Omitted from the response when not set in Mongo** (per the `,omitempty` JSON tag on the DTO). FE must not assume `streamUrl` is always present. |

**`password` is NOT returned** — even on the admin endpoint. The Mongo `password` field is AES-256-GCM encrypted; admin who needs to update it submits a new value via PATCH. Read-back is intentionally never exposed.

#### URL sanitization (v4.8.2 hotfix)

The 4.8.1 smoke (2026-05-01) found that the v4.8.0 endpoint returned `URL` and `StreamURL` verbatim from Mongo. Cameras configured with embedded creds in URL (legacy admin form input — e.g. `rtsp://admin:P@ssw0rd@192.168.1.191/...`) leaked the password inside the URL string even though the `Password` field was correctly omitted as a separate JSON key. **Pre-4.8.2 callers must NOT trust `url` as creds-free.**

**v4.8.2 (2026-05-01) hotfix** added a `sanitizeStreamURL` helper that strips the `user:password@` userinfo segment from any returned URL while preserving scheme, host, port, path, and query. Examples:

| Stored value (Mongo) | Returned value (response) |
|---|---|
| `rtsp://192.168.1.100/stream` | `rtsp://192.168.1.100/stream` (no-op) |
| `rtsp://admin:P%40ssw0rd@192.168.1.191/unicast/c2/s2/live` | `rtsp://192.168.1.191/unicast/c2/s2/live` |
| `rtsp://admin@192.168.1.191/unicast` | `rtsp://192.168.1.191/unicast` (user-only stripped too) |
| `rtsps://user:pw@host/path` | `rtsps://host/path` |
| `http://admin:secret@cam.local:8443/api/stream?codec=h264` | `http://cam.local:8443/api/stream?codec=h264` (port + query preserved) |

The DTO marshaling test asserts the sentinel regex `[a-z]+://[^/"]+:[^/"@]+@` never appears in the response body. Future field additions that surface URL-shaped data must pipe through `sanitizeStreamURL` (or equivalent) before serialization.

#### Error contract

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | missing/invalid Bearer |
| 403 | `FORBIDDEN` | `platformRole != "administrator"` (even org-admin gets 403 here) |
| 404 | `NOT_FOUND` | camera not in active org |

#### Audit

`Audit` middleware required on this route. Every successful read is logged with `{userId, camId, orgId, action="camera.credentials.read"}` so credential exposure is traceable.

---

### 1.4 `GET /kapi/dashboard/counters` (NEW — Phase 3b, v4.8.0+)

**Purpose:** single endpoint for FE dashboard widgets to fetch all counter aggregates without N parallel queries.

**Auth:** Bearer JWT + `X-Active-Org`. Caller's Permify visibility filters the `cameras` counts (same as `/resources/camera` — Permify-filtered per requester).

**Query parameters:**
- `scope` (string, optional, default `"owner"`) — `"public" | "owner" | "all"`. Mirrors existing `/dashboard/timeseries` scope semantics.
- `siteId` (string, optional) — additional filter; when set, restricts cameras + events to those tagged with the given site. (Q3 in plan §14 still open: confirm `siteId` reliability vs `groupId`.)
- `window` (string, optional, default `"today"`) — event-counting window: `"lastHour" | "today" | "last24h" | "last7d"`.

#### Success response (200)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "cameras": {
      "total": 142,
      "online": 130,
      "offline": 8,
      "suspect": 3,
      "unknown": 1
    },
    "notifications": {
      "pending": 5,
      "today": 47,
      "lastHour": 3
    },
    "alerts": {
      "byPriority": {
        "high": 2,
        "medium": 12,
        "low": 33
      }
    },
    "scope": "owner",
    "window": "today",
    "asOf": "2026-05-01T16:00:00Z",
    "cacheTtlSec": 10
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `cameras.*` | int | counts from `cammonv1.ListOrgCameraStatuses` grouped by 4-state FSM |
| `notifications.*` | int | counts from `event_refs` per window |
| `alerts.byPriority.*` | int | counts from `event_refs` aggregated by `priority` field per window |
| `scope` | string | echoes the request scope (so FE can confirm) |
| `window` | string | echoes the request window |
| `asOf` | RFC3339 UTC | the timestamp the underlying data was read at |
| `cacheTtlSec` | int | how long this response is valid in the in-memory cache (default 10s; configurable per D2) |

#### Error contract

| HTTP | code | Cause |
|---|---|---|
| 400 | `BAD_REQUEST` | invalid `scope` or `window` value |
| 401 | `UNAUTHORIZED` | missing/invalid Bearer |
| 403 | `FORBIDDEN` | missing `X-Active-Org` |

#### Cache semantics

- **In-memory per-org cache** keyed by `(orgId, scope, siteId, window)`.
- TTL default: 10s (configurable via `DASHBOARD_COUNTERS_CACHE_TTL_SEC` env, plan D2).
- Cache miss: aggregate fresh, return + populate cache. Cache hit: return cached `asOf` (still useful for FE to know staleness).
- Counters are eventually consistent — a write to `event_refs` may take up to `cacheTtlSec` to reflect.

---

### 1.5 `CameraDTO` redaction (Phase 3a.1) — staged behind env flag

**Shipping pattern.** Phase 3a.1 lands in **two stages** behind a single env flag so the breaking response-shape change rolls out coordinated with FE — no surprise 500s from FE direct readers when redaction goes live.

**Env flag:** `STREAM_SECURITY_REDACT_CAMERADTO`
- Default: `false` (OFF)
- Truthy values (case-insensitive): `true`, `1`, `yes`, `on`
- Any other value (or unset) = OFF
- Read on every `ToDTO` call (cheap; lets ops dial-up via deploy config without a redeploy)
- Constant + helpers live at [internal/repo/devicerepo/camera_redact.go](../../internal/repo/devicerepo/camera_redact.go)

#### State A — flag OFF (v4.9.0 default; current shipped behavior)

`URL` + `StreamURL` are **sanitized** (userinfo stripped via `sanitizeURL`) but the fields stay populated. `IP` + `User` are unchanged. **No shape change** vs pre-4.9.0 — FE direct readers keep working.

```json
{
  "id": "cam-uuid-1",
  "tenantId": "tenant-uuid",
  "orgId": "org-uuid",
  "name": "Lobby Camera",
  "ip": "192.168.1.100",                ⚠ still present
  "user": "admin",                      ⚠ still present
  "streamUrl": "rtsp://192.168.1.100/profile1",   ✓ userinfo stripped
  "url": "rtsp://192.168.1.100/...",              ✓ userinfo stripped
  "brand": "Dahua",
  "mapVisibility": "private",
  "monitorState": "online",
  "...": "..."
}
```

Behavior change vs 4.8.x = userinfo strip applies to **every** camera response (defense-in-depth — closes the last footgun on the public list/detail surface that the 4.8.1 smoke caught at the admin endpoint).

#### State B — flag ON (final 3a.1 hard-omit shape)

`IP` + `User` + `URL` + `StreamURL` are zeroed. The existing `omitempty` JSON tags drop them from the response. End-state shape FE migrates to.

```json
{
  "id": "cam-uuid-1",
  "tenantId": "tenant-uuid",
  "orgId": "org-uuid",
  "name": "Lobby Camera",
  "brand": "Dahua",
  "mapVisibility": "private",
  "monitorState": "online",
  "...": "..."
}
```

Removed JSON keys: `ip`, `user`, `streamUrl`, `url`. (`ip` is removed too because it identifies the upstream camera target — same probing-vector risk class.)

#### Sentinel guarantee (3a.6 — load-bearing)

Regardless of flag state, the marshaled response body **MUST NOT** contain a `://user:pass@` userinfo pattern. This is locked in [internal/repo/devicerepo/camera_redact_test.go](../../internal/repo/devicerepo/camera_redact_test.go) `TestSentinel_ResponseBodyNeverContainsUserinfoPattern`, which runs the anti-pattern regex against marshaled DTOs in **both** flag states. The 4.8.1 smoke (which detected the password leak via the same pattern at HTTP-response level) is now a unit-test invariant — any future regression trips before shipping.

#### FE impact (klynx@feature)

| FE concern | Flag OFF (today) | Flag ON (after migration) |
|---|---|---|
| Read `camera.url` / `camera.streamUrl` | works; URL is creds-free | returns `undefined` |
| Read `camera.user` / `camera.ip` | works | returns `undefined` |
| Playback | works either way (`createStream()` does not depend on `camera.url`) | unchanged |
| Admin edit form pre-fill | works via direct read | must call `GET /admin/cameras/{camId}/credentials` |
| Diagnostic IP display for non-admin | works | deprecated — out of scope for v1 |

#### Rollout sequence (canonical)

| Step | When | Who | What |
|---|---|---|---|
| 1 | **v4.9.0 (shipped)** | klynx-api | Helper + flag wiring lands. Flag OFF on dev + prod. State A is the live behavior. |
| 2 | FE Phase 3a.1 plan ([docs/plan/done/phase3a1-camera-url-redaction-fe-handoff.md](../plan/done/phase3a1-camera-url-redaction-fe-handoff.md)) | klynx (FE) | 6 direct-reader sites migrate to admin endpoint or `createStream()`. FE confirms via Telegram or PR comment on klynx-api. |
| 3 | post-FE confirmation | ops | Flip `STREAM_SECURITY_REDACT_CAMERADTO=true` on **dev cluster first**. Smoke camera list/detail responses against the sentinel regex + key-absence checks. |
| 4 | dev stable for ≥1 day | ops | Flip the same flag on **prod**. Same smoke. |
| 5 | flag-on stable for ≥1 week | klynx-api | Follow-up chore PR removes the env flag entirely + marks fields `json:"-"` (or removes them from the struct). Final v4.10.x cleanup. |

**Backward compatibility:**
- v4.9.0 flag-OFF is **fully backward compatible** with pre-4.9.0 FE — same JSON keys, only the userinfo substring inside `url` / `streamUrl` is stripped (and any pre-4.9.0 caller that relied on creds embedded in the URL was already broken by 4.8.2's admin-endpoint hotfix).
- v4.9.0 flag-ON is **breaking-but-gated** — the response keys disappear; FE must have completed Phase 3a.1 migration first.
- **Rollback** = ops flips the env flag back to `false`. No redeploy required, no data loss. The same binary serves both states.

---

## 2. Behavior Matrices

### 2.1 Session viewer binding (Phase 3a.5)

| Viewer type | Bound to | Behavior on URL share |
|---|---|---|
| `authenticated` | `userId` (from JWT at issue time) | Other user with the URL fails ZLM `onPlay` (token+userId mismatch); their request is denied with 403 |
| `public` | `clientIP` (from issue request) | Other client IP with the URL fails; same browser refresh succeeds (same IP) |

**No-binding mode is NOT supported in v1** — every session has either userId or clientIp binding. Keeps the security posture uniform.

### 2.2 Counter cache behavior (3b)

| Request | Cache state | Action |
|---|---|---|
| First call for `(orgId, scope, siteId, window)` | empty | Aggregate fresh; populate cache; return with `asOf=now` |
| Same key within `cacheTtlSec` | hit (< 10s old) | Return cached; `asOf` unchanged from initial population |
| Same key after `cacheTtlSec` | miss (expired) | Re-aggregate; return with new `asOf` |
| Different `scope` for same org | independent cache key | Each scope is independently cached |

### 2.3 Admin credentials endpoint role gate (3a.1)

| Caller `platformRole` | Caller has `organization.manage` on org? | Outcome |
|---|---|---|
| `administrator` | (any) | 200 success |
| `user` | yes (org-admin) | 403 — org-admin is NOT enough; only platform admin sees raw creds |
| `user` | no | 403 |

---

## 3. Frontend Field Mapping

| FE concept | Legacy source (pre-3a.1 / pre-3b) | Canonical source (3a.1 flag-ON / 3b shipped) |
|---|---|---|
| Camera playback URL | composed from `camera.url` + auth | `details.playUrl` from `GET /media/stream/{camId}` |
| Camera username (admin pre-fill) | `camera.user` from `/resources/camera/{id}` | `details.user` from `GET /admin/cameras/{id}/credentials` (platform-admin only) |
| Dashboard camera count | sum from `/resources/camera?perPage=...` listings | `details.cameras.total` from `GET /dashboard/counters` |
| Notification count | aggregated client-side from `/dashboard/timeseries` | `details.notifications.*` from `GET /dashboard/counters` |

**Reading the table during the staged rollout window.** At v4.9.0 flag-OFF (current default), the legacy sources for the camera rows still work — `camera.url` / `camera.user` are present on `CameraDTO` (with userinfo stripped). FE may migrate to the canonical sources at any time; nothing breaks. The legacy column becomes unavailable only when ops flips `STREAM_SECURITY_REDACT_CAMERADTO=true` per §1.5 rollout step 3.

Tree-picker / opt-in flags (resourceGroup hierarchy + orgUnit children) are unchanged from existing contracts ([resourceGroup-hierarchy.md](resourceGroup-hierarchy.md) §6, [permission-profile-camera-grants.md](permission-profile-camera-grants.md) §7).

---

## 4. Backwards Compatibility

- ✅ `GET /media/stream/{camId}` shape unchanged — already returns `playUrl`-only.
- ✅ `GET /dashboard/counters` is a new endpoint — additive.
- ✅ `GET /admin/cameras/{id}/credentials` is a new endpoint — additive.
- ✅ **`CameraDTO` shape unchanged at v4.9.0 flag-OFF default** — all four fields (`ip`, `user`, `streamUrl`, `url`) remain present. Only the userinfo substring inside `url` / `streamUrl` is stripped (defense-in-depth; pre-4.9.0 callers that relied on embedded creds were already broken by 4.8.2). FE direct readers keep working.
- ⚠ **`CameraDTO` shape change at flag-ON IS breaking** — `ip` / `user` / `streamUrl` / `url` keys disappear. Gated behind `STREAM_SECURITY_REDACT_CAMERADTO=true`; ops flips only after FE Phase 3a.1 migration is observed stable on dev cluster (per §1.5 rollout step 3). Rollback = flip the flag back to `false` — no redeploy required, same binary.
- 🛡 **Sentinel invariant** — `://user:pass@` userinfo pattern never appears in the marshaled body in either flag state. Locked at unit-test level (3a.6) so any future regression trips before shipping.

---

## 5. Out of Scope

- WebRTC playback substrate (D1 — Phase 4+ decision).
- Server-Sent Events `GET /dashboard/stream` (3c — deferred to v2).
- POST `/live/cameras/{camId}/play` rename (D8 — deferred to v2).
- Video wall layout endpoints (1/4/9/16) — pure FE.
- Map clustering algorithm changes — `/live/map/cluster` already ships server-side.

---

## 6. Open Contract Questions

(Mirrors plan §14 Q2–Q6; recorded here so the contract reviewer doesn't need to context-switch.)

- **Q2 — `?scope=public` semantics on `/dashboard/counters`:** counts anonymous-visible cameras only, OR counts all org cameras with public-flagged events? Confirm with FE/PM.
- **Q3 — `siteId` filter:** site is not a first-class entity in klynx-api; `siteId` derived from camera location metadata. Confirm reliability OR change filter to `groupId` (resourceGroup).
- **Q4 — Video wall load test:** ceiling for concurrent HLS streams per ZLM node. **Tracked as ops follow-up, not a contract item.**
- **Q5 — Multi-session per user for video wall:** confirm FE issues N independent `GET /media/stream/{camId}` calls (1 session per channel). If single-session-shared model is preferred, contract D4 changes.
- **Q6 — SSE v2 trigger condition:** define explicit metric (req/sec/org or 95p latency) at which polling cost justifies SSE infra investment.

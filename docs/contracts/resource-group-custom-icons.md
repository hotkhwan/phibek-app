# Contract — ResourceGroup Custom Icons (online / offline)

**Plan:** [docs/plan/done/resource-group-custom-icons.md](../plan/done/resource-group-custom-icons.md) (Phase 1+2 shipped 2026-05-02 in 4.12.0). Phase 1.5 (map endpoints) plan: [docs/plan/done/camera-icon-phase1.5-map-endpoints.md](../plan/done/camera-icon-phase1.5-map-endpoints.md). Phase 1.6 (auth'd cross-org resolution) plan: [docs/plan/camera-icon-phase1.6-cross-org.md](../plan/camera-icon-phase1.6-cross-org.md).
**Owner:** klynx-api
**Status:** Superseded by [`resource-group.md`](./resource-group.md) on 2026-05-04 — RG custom icons + RG hierarchy + RG/camera round-trip merged into one ResourceGroup lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All v0.4 behavior preserved verbatim: §5.2-§5.4 of the merged contract carry the icon body semantics, the camera response resolver (lex-first wins, parent walk, MAX_DEPTH=10), the 5-endpoint map coverage table (Phase 1.5/1.6/1.7), the upload endpoint validation pipeline, the Option C URL allowlist, all 4 icon error codes, the Permify visibility matrix, the resolver pseudo-code, and the full v0.2 decision log. Body kept here for PR / Codex review history.
**Versions affected:**
- New klynx-api minor (proposed): adds `icon` field on `resourceGroups`; adds resolver-derived `icon` on camera response. Backward compatible (additive).
**Cross-repo pair:** FE-local proposal mirror at `klynx-feature/docs/contracts/resource-group-custom-icons.md` (v0.2 — synced).
**v0.2 changes (from v0.1):** Q1 collapsed to **MVP-secure** bundle (self-hosted upload + self-hosted-only URL); §1.1/§1.2 POST/PATCH absent path = don't write (B4); §1.4 multi-RG rule = lex-first (B2); §3 validation = single partial-GET sync at upload only (B3); §3.7 + §4 error code 422→400 (NB5); §5 resolver rewritten on existing primitives `GetGroupsForCamerasMap` + Mongo `parentGroupId` walk (B1); §6 + `mapVisibility` row (B5); §10 v0.2 decisions logged.

---

## 1. Endpoint Surface

### 1.1 `POST /kapi/resources/groups` — create RG with optional icon

**Auth:** Bearer JWT. Caller must have `organization.manage` permission on the active org (header `X-Active-Org`).

**Headers:**
- `Authorization: Bearer <token>` (required)
- `X-Active-Org: <orgId>` (required)
- `Content-Type: application/json` (required)

**Request body (additive — existing fields unchanged):**

```json
{
  "name": "Lobby Cameras",
  "description": "...",
  "resourceType": "camera",
  "mapVisibility": "public",
  "filterVisibility": "public",
  "parentGroupId": null,
  "icon": {
    "online":  "https://cdn.klynx.com/icons/lobby-on.png",
    "offline": "https://cdn.klynx.com/icons/lobby-off.png"
  }
}
```

**`icon` field semantics (POST) — v0.2 (B4: don't-write-when-omitted):**

| Value sent | Backend behaviour |
|---|---|
| field absent | **do NOT write `icon` to Mongo doc** — preserves legacy-doc storage shape; response normalizer produces `{online:null, offline:null}` at read time |
| `null` | normalize to `{online:null, offline:null}` and write the field (explicit "icon-cleared" doc — same API surface as absent) |
| `{online: "<url>"}` | partial — write `{online:"<url>", offline:null}` |
| `{online: "<url>", offline: "<url>"}` | write both |
| any URL fails validation (§3) | 400 with appropriate error code; no doc created |

**Why don't-write-when-omitted (B4):** keeps legacy-doc story consistent — any RG doc without `icon` field (whether legacy or new POST without `icon`) produces the same response. Saves bytes per doc. Response normalizer (§7.1 mapper) is the single contact point that produces the API-visible `{null, null}` shape.

**Success (201):** standard envelope; `details` is the created RG including `icon: IconBundle` (always present in response).

### 1.2 `PATCH /kapi/resources/groups/{id}` — update RG icon

**Auth:** Bearer + `X-Active-Org` + `organization.manage`.

**Request body (additive — existing fields unchanged):**

```json
{
  "icon": {
    "online":  "https://cdn.klynx.com/icons/lobby-on-v2.png"
  }
}
```

**`icon` field semantics (PATCH — partial-merge) — v0.2 (B4: align absent behaviour):**

| Value sent | Backend behaviour |
|---|---|
| `icon` field absent (`nil`) | nil-keep — no change to stored Mongo doc (`icon` field stays as-is, even if absent from doc) |
| `icon: null` | clear → write `{online:null, offline:null}` to Mongo (explicit clear) |
| `icon: { online: "<url>" }` | update `online` only; `offline` preserved (read existing → merge → write) |
| `icon: { online: null, offline: "<url>" }` | set online to null + offline to URL (write merged result) |
| `icon: { online: "<url>", offline: "<url>" }` | replace both |
| any URL fails validation | 400; no Mongo write |

**Note for legacy docs:** for an RG without an `icon` field in Mongo, partial PATCH (`icon: { online: "<url>" }`) reads `IconBundle{}` zero-value as the existing → merges → writes the resulting `{online:"<url>", offline:null}`.

**Status field:** unchanged from existing PATCH semantics (BE 4.7.3 nil-keep applies).

**Success (200):** standard envelope; `details` is the updated RG including `icon: IconBundle`.

### 1.3 `GET /kapi/resources/groups[/{id}]` — list / detail with `icon`

**Auth:** Bearer + `X-Active-Org`.

**Response details (additive):**

```json
{
  "id": "rg-uuid-1",
  "name": "Lobby Cameras",
  ...existing fields...,
  "icon": {
    "online":  "https://cdn.klynx.com/icons/lobby-on.png",
    "offline": "https://cdn.klynx.com/icons/lobby-off.png"
  }
}
```

**Legacy doc handling:** RG docs created before this feature lack `icon` in Mongo; BE response normalizes to `{online: null, offline: null}` — never `undefined` or missing. FE always reads a populated `IconBundle`.

### 1.4 `GET /kapi/resources/camera[/{id}]` — camera with BE-resolved `icon`

**Auth:** Bearer + `X-Active-Org` (or anonymous via `/kapi/live/map/options`).

**Response item (additive — derived field, not persisted):**

```json
{
  "id": "cam-uuid-1",
  "name": "Lobby Camera 01",
  "lat": 13.7563,
  "lng": 100.5018,
  "status": true,
  ...existing fields...,
  "icon": {
    "online":  "https://cdn.klynx.com/icons/lobby-on.png",
    "offline": null
  }
}
```

**`icon` field semantics (read-only, computed per request):**

| Camera state | Resolution rule |
|---|---|
| Camera in RG `R` with `R.icon.online != null` | `icon.online = R.icon.online` |
| Camera in RG `R` with `R.icon.online == null` and `R.parentGroupId != null` | walk to `R.parent`, `R.parent.parent`, … until first non-null `icon.online`; else null |
| online and offline are resolved **independently** | each state walks the chain on its own — possible to have `{online: <url>, offline: null}` |
| Camera not in any RG, OR no RG in chain has icon | `{online: null, offline: null}` — FE falls back to default |

**Permify visibility:** the resolver respects existing `filterVisibility` rules. A camera's icon resolved through an RG with `filterVisibility=internal` is **not** exposed via public endpoints (`/kapi/live/map/options`), even if the camera itself is public. Authenticated endpoints (`/kapi/resources/camera` with org context) follow standard Permify check.

**Multi-RG-per-camera (v0.2 — B2: lex-first wins):**

The codebase already supports cameras in multiple RGs via `GetGroupsForCamera` returning a list (B-Wire). When camera C is in N>1 RGs:

- **Rule:** sort C's RGs by `groupId` ascending (lexicographic). Take the **first RG only** (`R0`). Walk `R0`'s `parentGroupId` chain to resolve `online` and `offline` independently. Sibling RGs (`R1`, `R2`, …) are NOT consulted.
- **Why lex-first not union-first-non-null:** O(depth) vs O(N_rgs × depth) — keeps perf bounded for large orgs. Multi-RG-per-camera is uncommon in practice (typical UX puts a camera in one canonical RG). Admin docs explain "set the icon at the canonical RG (lex-first by ID)."
- **Determinism:** same camera + same RG set → same `IconBundle` regardless of caller order.
- **v2 escape hatch:** if admin feedback demands union-first-non-null, the resolver can be upgraded without breaking the storage shape (`icon` field unchanged).

**Cycle defense:** Cycle in `RG.parentGroupId` chain (shouldn't happen — Phase C1 cycle guard) → resolver bails after walking `MAX_DEPTH=10` levels; logs warn; returns null.

### 1.4b Map endpoints — same `icon` field on the camera DTOs (Phase 1.5, v0.3 — 2026-05-03)

The same BE-resolved `icon: IconBundle` field added in §1.4 also appears on the four map / map-options endpoints below. Field name, type, semantics (lex-first RG, parent-walk, online + offline independent, `{null,null}` fallback) are identical — FE reads the same `IconBundle` shape regardless of which endpoint served the camera.

| Endpoint | Auth | DTO | Resolution scope | Cross-org cameras |
|---|---|---|---|---|
| `GET /kapi/map/camera` | Bearer + X-Active-Org | `MapCameraItem` | full resolver on `IsOwner=true` | `IsOwner=false` items get `{null,null}` in v1 |
| `GET /kapi/map/camera/cluster` | Bearer + X-Active-Org | `MapCameraItem` (in `devices[]`) | same as above; cluster items unchanged | same |
| `GET /kapi/live/map` (auth'd path, `X-Active-Org` set) | optional Bearer | `MapCameraItem` | full resolver on org-owned | cross-org public items: `{null,null}` in v1 |
| `GET /kapi/live/map` (anon path) | none | `PublicCameraItem` | resolver disabled in v1 | every item: `{null,null}` in v1 |
| `GET /kapi/live/map/options` | none | `GroupOption` | RG own `Icon` passthrough — **no cascade**, no resolver | n/a (RG, not camera) |

**Why cross-org gets `{null,null}` in v1:** the existing bulk resolver `GetGroupsForCamerasMap(tenantId, orgId)` is org-scoped (single Permify scan per org). Cross-org public cameras come from N other orgs — naive resolution would be N Permify scans (auth'd `/live/map` cross-org) or per-camera lookup (anon `/live/map`, N+1). Phase 1.5 ships the simple org-scoped path; **cross-org icon resolution is a v1.6 follow-up** once perf budget is set. FE falls back to default markers for cross-org items in v1.

**Why `/kapi/live/map/options` is RG own (not cascade):** the dropdown shows a single RG entry, not a camera. The RG's own icon is what the user sees next to the RG name — cascade is meant for a camera-under-the-RG resolution, not for the RG itself. Legacy RGs without `icon` field surface as `{null,null}` per the same normalization rule as §1.3. Internal-visibility RGs are still excluded from this surface by the existing B-Wire `filterVisibility != "internal"` filter (no behavioral change).

**Tracking-pixel risk on anon `/live/map`:** v0.3 ships anon path with `icon: {null,null}` — **no third-party URL is ever returned to anonymous callers**. When v1.6 enables cross-org resolution, the §6 row "Authenticated cross-org `GET /kapi/live/map`" rationale (URL host = `KLYNX_ICON_CDN_HOST` only, Option C upload-only) extends to the anon path with no new risk. Documented here to lock the assumption ahead of v1.6.

**Backward compat:** additive field on three DTOs. Pre-v0.3 FE clients ignoring `icon` continue to work. No env flag.

### 1.5 `POST /kapi/resources/icons/upload` — self-hosted upload (v0.2: REQUIRED under MVP-secure bundle)

**v0.2 — REQUIRED endpoint** under the MVP-secure bundle (Q1=b + Q6=c, plan §12). Admins cannot paste external URLs; they upload only.

**Auth:** Bearer + `X-Active-Org` + `organization.manage`.

**Request:** `multipart/form-data; file=<image>`

**Validation:** format + size + dimensions per §3 (single-pass on the multipart byte stream — no external fetch). Magic-byte sniff (don't trust client `Content-Type` header); `Content-Length` parse for size; `image.DecodeConfig` for dimensions.

**Storage:** `internal/infra/s3` (existing klynx adapter per CLAUDE.md §Stack — NB7). Object key: `icons/{orgId}/{sha256}.{ext}`. Public-read ACL on the icons prefix; bucket fronted by `cdn.klynx.com` (env `KLYNX_ICON_CDN_HOST`). Object content-type matches the validated format.

**Idempotency:** re-uploading the same bytes (same sha256) returns the same URL — no duplicate objects.

**Success (200):** `details: { url: "https://cdn.klynx.com/icons/<orgId>/<sha256>.png" }` — URL is automatically whitelist-compliant per §3.2 Option C.

**Side effect — admin sets `icon.online` later:**
1. Admin uploads → gets URL `U1`
2. Admin PATCHes RG with `icon: { online: U1 }`
3. BE validates `U1` against §3.2 (host = `KLYNX_ICON_CDN_HOST` ✓; format inferred from extension ✓; no external fetch needed since BE issued the URL)
4. Stores in Mongo

**Storage hygiene (deferred to v2):** orphan-icon GC sweeper (icons not referenced by any RG); per-org quota. v1 ships without — disk cost is bounded (500 KB cap × upload count) and review can flag.

---

## 2. Type Reference — `IconBundle`

```ts
type IconBundle = {
  online: string | null   // HTTPS URL, validated per §3; null = no override for online state
  offline: string | null  // HTTPS URL, validated per §3; null = no override for offline state
}
```

Used in:
- `resourceGroups.icon` (admin source — Mongo-persisted)
- `GET /kapi/resources/groups` response (echo of source)
- `GET /kapi/resources/camera` response (BE-resolved per §1.4)
- upload endpoint response is single URL string, not `IconBundle`

**Why nested object:** future-proof namespace. If BE later wants per-state alpha (e.g. `recording`, `error`), extend `IconBundle` without touching root fields. Single `IconBundle` shape is reused everywhere — FE needs only one type.

---

## 3. URL / File Validation

This section defines the canonical validation rules BE applies to every icon URL on write (POST/PATCH) and to every file accepted by the required upload endpoint.

### 3.1 Scheme allowlist

- **Allowed:** `https://`
- **Rejected:** `http://`, `data:`, `javascript:`, `file://`, `ftp://`, any custom scheme
- **Error:** 400 `INVALID_ICON_URL`, `details.allowedSchemes: ["https"]`

### 3.2 Origin allowlist (v0.2 — B6: MVP-secure picked → Option C)

**v0.2 decision: Option C — self-hosted upload only.**

- **Allowed host:** `KLYNX_ICON_CDN_HOST` (env, e.g. `cdn.klynx.com`). URL must match `https://${KLYNX_ICON_CDN_HOST}/icons/...`.
- **Rejected:** any other host, including HTTPS-correct external CDNs.
- **Error:** 400 `INVALID_ICON_URL`, `details.allowedOrigins: ["cdn.klynx.com"]`, `details.url: "<got>"`.
- **Why Option C over B (whitelist multiple hosts):** closes phishing-pixel + tracking attack surface entirely. Requires §1.5 upload endpoint, which we ship in the same release per B6 plan decision.
- **Implementation:** simple `strings.HasPrefix(url, fmt.Sprintf("https://%s/icons/", host))` check in the URL validator. No external HEAD/GET probe needed (BE owns the URL).

**Rejected v0.2 options (kept here for rationale, not action):**
- *Option A — open-https:* any HTTPS URL accepted. Phishing pixel + tracking risk. Rejected.
- *Option B — whitelist multiple hosts:* env `KLYNX_ICON_ORIGINS_WHITELIST=cdn.klynx.com,cdn.partner.com`. Less secure than C; admin still pastes URLs (UX two paths). Rejected for v1.

### 3.3 Format allowlist (content-type validation)

- **Allowed:** `image/png`, `image/jpeg`, `image/webp`
- **Rejected:** `image/svg+xml`, `image/gif`, `image/bmp`, anything else
- **Error:** 400 `ICON_FORMAT_UNSUPPORTED`, `details.allowedFormats: ["image/png","image/jpeg","image/webp"]`, `details.got: "<actual>"`

**SVG explicitly rejected** for XSS prevention (see plan §11 Risks).

**v0.2 — How BE validates (B3: single-pass, sync, MVP-secure simplification):**

Validation runs ONLY at the §1.5 upload endpoint. PATCH/POST on RG receives a URL that BE itself issued — no external fetch.

**Upload endpoint single-pass flow:**

1. Read up to 64 KB of the multipart body (cap-bounded).
2. Magic-byte sniff first 12 bytes → derive `Content-Type` (don't trust client `Content-Type` header).
3. `Content-Length` parse → check size limit (§3.4); reject as `ICON_SIZE_EXCEEDED` if exceeded.
4. `image.DecodeConfig` on the read buffer → derive width/height; check §3.5; reject as `ICON_DIMENSION_INVALID`.
5. If all pass → continue reading remainder (≤ 500 KB total) → write to `internal/infra/s3`.

**Sync mode:** admin waits ~100–300 ms on the upload endpoint (small file + local S3). No async/202 needed. Timeout: 5s upload + 2s S3 PutObject.

**No external HEAD/GET probe** — that path was for the rejected open-https / whitelist-multiple-host design (v0.1 §3.2 Option A/B). With Option C, the BE issues every URL, so URL→file fetch is never required.

### 3.4 Size limit

- **Default:** 500 KB (524288 bytes)
- **Tunable via env:** `KLYNX_ICON_MAX_SIZE_BYTES` (range 1024 to 10485760)
- **Error:** 400 `ICON_SIZE_EXCEEDED`, `details.limit: 524288`, `details.got: <actual>`
- **Enforced at:** §1.5 upload endpoint only (PATCH/POST URL is self-issued, size already validated at upload time).

### 3.5 Dimension limit

- **Default:** min 16×16 px, max 256×256 px
- **Tunable:** `KLYNX_ICON_MIN_DIM` / `KLYNX_ICON_MAX_DIM`
- **Error:** 400 `ICON_DIMENSION_INVALID`, `details.minDim: 16`, `details.maxDim: 256`, `details.gotWidth: <n>`, `details.gotHeight: <n>`
- **How BE validates:** `image.DecodeConfig` on the multipart byte buffer (no full-image decode needed — header is enough).

### 3.6 Aspect ratio (advisory, not enforced)

- Square images recommended (markers are usually square). Non-square accepted but may render with letterbox in FE.

### 3.7 ~~Load-failure (external URL only)~~ — REMOVED in v0.2

The `ICON_LOAD_FAILED` error code was specific to v0.1 Option A/B (external URL fetch on PATCH/POST). With v0.2 Option C (MVP-secure / self-hosted upload only), BE issues every URL and never fetches an external URL on write — so this code is impossible to trigger.

**If a future version re-introduces external URLs (v2+):** use `400 ICON_LOAD_FAILED` (not 422 — NB5 alignment with klynx-api convention of 400-family for client-fixable validation; reserves 422 for "syntactically valid but semantically rejected" use cases that are rare in this codebase).

---

## 4. Error Codes — Reference

All errors use the standard envelope per CLAUDE.md §"Standard success envelopes":

```json
{
  "code": "<ERROR_CODE>",
  "message": "human-readable",
  "details": { /* code-specific structured data */ },
  "status": false
}
```

| Status | Code | Trigger | `details` fields |
|---|---|---|---|
| 400 | `INVALID_ICON_URL` | scheme rejected OR host ≠ `KLYNX_ICON_CDN_HOST` (Option C self-hosted-only) | `{ url, allowedSchemes: ["https"], allowedOrigins: ["cdn.klynx.com"] }` |
| 400 | `ICON_FORMAT_UNSUPPORTED` | magic-byte sniff format not allowed (incl. SVG) | `{ got: "<actual>", allowedFormats: ["image/png", "image/jpeg", "image/webp"] }` |
| 400 | `ICON_SIZE_EXCEEDED` | upload file too large | `{ limit: 524288, got: <bytes> }` |
| 400 | `ICON_DIMENSION_INVALID` | dimensions out of bounds | `{ minDim: 16, maxDim: 256, gotWidth: <n>, gotHeight: <n> }` |
| 413 | (HTTP standard) | upload exceeds server-config payload limit | n/a — HTTP stack returns this before code reaches handler |

**v0.2 changes:** `ICON_LOAD_FAILED` removed (v0.1 422 → v0.2 N/A — see §3.7). All validation errors are 400-family per NB5 (klynx-api convention).

**FE consumer pattern:**
- Read `code` field
- Localize error message via i18n key `toast.iconErr.<code>`
- Display structured `details` (e.g. "อัพโหลดไม่ได้: ขนาดเกิน 500 KB (ไฟล์: 800 KB)" — pulled from `details.limit` + `details.got`)

---

## 5. Resolver Algorithm (v0.2 — B1: rewritten on existing primitives)

The v0.1 reference to `permify.lookup_camera_rgs` was wrong — that primitive does not exist in klynx-api. The v0.2 resolver reuses primitives already used by Phase 2b/C2 + B-Wire reference paths.

### Existing primitives consumed

| Primitive | Returns | Use |
|---|---|---|
| `MemberAccessService.ResolveViewableEntityIDs(orgId, userId, "camera")` | `[]string` (camera IDs visible to caller) | Permify-filter step (already runs in camera list endpoint) |
| `ResourceGroupService.GetGroupsForCamerasMap(ctx, tenantId, orgId)` | `map[camId][]ResourceGroup` (bulk camera→RG map; ONE Permify scan) | replace v0.1's per-camera Permify call (B1: avoid N+1) |
| `ResourceGroupRepo.FindByIDAndOrg(ctx, rgId, tenantId, orgId)` | `*ResourceGroup` (Mongo single-doc fetch with tenant/org guard) | walk `parentGroupId` chain |

`GetGroupsForCamerasMap` already powers B-Wire camera detail metadata — proven hot path.

### v0.2 resolver pseudo-code

```go
// pkg: internal/services/devicesvc (NB1: was wrongly camerasvc in v0.1)
// called from CameraService.ListCameras (after Permify-filter step)
func (s *CameraService) resolveCameraIcons(
    ctx context.Context,
    tenantId string,
    orgId string,
    cameraIDs []string,
) (map[string]IconBundle, error) {

    // 1) Bulk camera→RGs map — ONE Permify scan, not N (B1)
    groupsByCam, err := s.rgSvc.GetGroupsForCamerasMap(ctx, tenantId, orgId)
    if err != nil {
        return nil, err
    }

    // 2) Per-request RG cache — populated lazily during walk (NB4: no cross-request cache in v1)
    rgCache := make(map[string]*ResourceGroup) // rgId → RG doc

    out := make(map[string]IconBundle, len(cameraIDs))
    for _, camID := range cameraIDs {
        rgs := groupsByCam[camID]
        if len(rgs) == 0 {
            out[camID] = IconBundle{} // {nil, nil}
            continue
        }

        // 3) Lex-first wins (B2) — sort by groupId asc, take first
        sort.Slice(rgs, func(i, j int) bool { return rgs[i].GroupID < rgs[j].GroupID })
        primaryRG := rgs[0]

        // 4) Walk parent chain independently per state
        out[camID] = IconBundle{
            Online:  s.walkChain(ctx, tenantId, &primaryRG, "online", rgCache),
            Offline: s.walkChain(ctx, tenantId, &primaryRG, "offline", rgCache),
        }
    }
    return out, nil
}

func (s *CameraService) walkChain(
    ctx context.Context,
    tenantId string,
    rg *ResourceGroup,
    state string, // "online" | "offline"
    cache map[string]*ResourceGroup,
) *string {

    const MAX_DEPTH = 10
    current := rg
    for i := 0; i < MAX_DEPTH; i++ {
        if url := pickIconURL(current, state); url != nil {
            return url
        }
        if current.ParentGroupID == nil || *current.ParentGroupID == "" {
            return nil // root reached
        }
        parent, ok := cache[*current.ParentGroupID]
        if !ok {
            var err error
            parent, err = s.rgRepo.FindByIDAndOrg(ctx, *current.ParentGroupID, tenantId, orgId)
            if err != nil || parent == nil {
                return nil // orphan parent — defensive
            }
            cache[*current.ParentGroupID] = parent
        }
        current = parent
    }
    log.Ctx(ctx).Warn().Str("rgId", rg.GroupID).Msg("rg-tree depth exceeded")
    return nil
}
```

### Caching

- **Per-request cache (v1 ships this):** `map[rgId]*ResourceGroup` populated lazily during walk. Single map per request, no cross-request invalidation needed. Mirrors Phase 2b/C2's `expandProfileResourceGroupIDs` BFS pattern.
- **Cross-request cache (NB4: deferred to v2):** keyed by `(orgId, rgVersion)`. Adds Mongo schema (`rgVersion` counter on RG writes) — too much overhead for v1. Defer until perf metrics show the request-scoped cache isn't enough.

### Performance target (v0.2 — NB3: concrete SLO)

- **Workload:** 1000 cameras × 5-deep RG tree
- **Resolver budget:** ≤ 50 ms p95 added to camera list endpoint
- **Absolute SLO:** total `/kapi/resources/camera` list endpoint p95 < 200 ms (cold) / < 100 ms (warm)
- **Verify in §13 smoke** of plan (Phase 2 perf check)

---

## 6. Permify + Visibility Interaction (v0.2 — B5: + mapVisibility row)

The resolver runs **after** Permify filters cameras visible to caller. Icons are presentation metadata layered on top of the existing visibility model.

### Visibility matrix

| Caller / Endpoint | RG `filterVisibility` | RG `mapVisibility` | Icon exposed? | Rationale |
|---|---|---|---|---|
| Anonymous `GET /kapi/live/map/options` (cross-org public) | `public` | `public` or `forcePublic` | ✅ RG own icon | RG own icon is presentation metadata for the dropdown picker (no resolver, no cascade) |
| Anonymous `GET /kapi/live/map/options` | `internal` | (any) | ❌ RG excluded by `filterVisibility != "internal"` filter | Internal RGs are hidden from the public Live picker; authenticated pickers remain permission-controlled |
| Anonymous `GET /kapi/live/map` (`PublicCameraItem`) | (any) | `public` or `forcePublic` | ⚠️ v1: `{null,null}` for every item | v1.6 follow-up: cross-org resolver. v1 ships placeholder field so FE can pin shape without a redeploy gate. |
| Authenticated org-member `GET /kapi/resources/camera` | `public` or `internal` | (any) | ✅ yes (within Permify scope) | Standard org view; icons follow camera visibility |
| Authenticated admin `GET /kapi/resources/camera` | (any) | (any) | ✅ yes (full org) | Admin sees all RGs in org |
| Authenticated `GET /kapi/map/camera` (org-owned) | `public` or `internal` | (any) | ✅ yes | Same resolver as `/kapi/resources/camera`; org context known |
| Authenticated `GET /kapi/map/camera` (cross-org public, `IsOwner=false`) | (any) | `public` or `forcePublic` | ✅ yes (v1.6, klynx-api 4.17.0) | Group-by-org bulk resolver — one Permify scan per distinct camera-source orgId |
| Authenticated `GET /kapi/live/map` (org-owned, `MapCameraItem`) | `public` or `internal` | (any) | ✅ yes | Auth'd path mirrors `/map/camera` for org-owned cameras |
| Authenticated `GET /kapi/live/map` (cross-org public) | (any) | `public` or `forcePublic` | ✅ yes (v1.6, klynx-api 4.17.0) | Same group-by-org path as `/map/camera` cross-org row above |
| Anonymous `GET /kapi/live/map` cross-org | (any) | `public` or `forcePublic` | ⚠️ **v1.7 target** — currently `{null,null}` | Holdback: tracking-pixel rationale needs product sign-off even though `KLYNX_ICON_CDN_HOST` Option C mitigates third-party risk. Defer to v1.7 chore once product approves. |

### Why icons are exposed on `mapVisibility=public` cross-org reads (B5 decision)

- **Argument for exposure:** the camera itself is intentionally cross-org public (admin opted in via `mapVisibility=public`). Icon is presentation metadata for that marker — not a sensitive field. Withholding the icon while showing the marker would be inconsistent.
- **Tracking-pixel risk:** under v0.2 Option C (self-hosted upload only — §3.2), every icon URL is `https://${KLYNX_ICON_CDN_HOST}/icons/...`. Anonymous cross-org public-map readers only ever fetch klynx-CDN. No third-party tracking surface.
- **Load-bearing security control:** §3.2 Option C (URL host = klynx CDN). If a future version re-introduces external URLs, this row needs to be revisited.

### No new Permify rules

Feature reuses existing camera-RG visibility logic. The resolver is a pure read-time transformation on top of the Permify-filtered camera set.

---

## 7. Mongo Schema

### 7.1 `resourceGroups` collection — additive field

```bson
{
  _id: ObjectId(...),
  id: "rg-uuid-1",
  orgId: "org-uuid-1",
  name: "Lobby Cameras",
  resourceType: "camera",
  mapVisibility: "public",
  filterVisibility: "public",
  parentGroupId: null,
  isRoot: true,
  icon: {                    // ← NEW (additive); legacy doc lacks this field
    online:  "https://cdn.klynx.com/icons/lobby-on.png",
    offline: null
  },
  createdBy: "...",
  createdAt: ISODate(...),
  updatedAt: ISODate(...)
}
```

**Migration:** none required. Go field unmarshal handles missing field as zero-value (empty `IconBundle{}`); mapper coerces to `{online:null, offline:null}` on response build.

**Index:** none — `icon` is not queried.

### 7.2 No new collections

Resolver reads from existing `resourceGroups`. The upload endpoint writes image objects through `internal/infra/s3`; no `iconUploads` or registry collection in v0.2.

---

## 8. Compatibility Matrix

| Caller | Pre-this-ship BE | Post-this-ship BE |
|---|---|---|
| Pre-this-ship FE (FE doesn't read camera.icon) | works | works (FE ignores new field) |
| Post-this-ship FE (FE reads camera.icon) | `camera.icon === undefined` → FE falls back to default | works (FE renders custom icons) |
| Pre-this-ship FE sends `icon: {...}` on PATCH | BE silently drops unknown field (Go struct binding) | BE accepts and persists |
| Post-this-ship FE sends bare `iconOnline: "..."` (flat) | n/a | BE silently drops unknown flat key or returns 400 if the request binder rejects unknown fields; canonical FE must send nested `icon` |

**Backward compat:** yes, fully additive. No migration window required.

---

## 9. Worked Examples

### 9.1 Admin sets icon on root RG; cascade picks it up for descendants

Setup:
- RG-1 "All Cameras" (root, `parentGroupId: null`, `icon: {online: "<rooturl>", offline: "<rooturl_off>"}`)
- RG-2 "Lobby" (child of RG-1, `icon: {online: null, offline: null}`)
- camera C1 in RG-2

GET `/kapi/resources/camera/C1` →
```json
{ ..., "icon": { "online": "<rooturl>", "offline": "<rooturl_off>" } }
```

### 9.2 Mid-chain icon override

Setup:
- RG-1 (root, icon for online + offline both set to "<root>")
- RG-2 (child of RG-1, `icon: {online: "<rg2_on>", offline: null}`)
- camera C2 in RG-2

GET camera C2 →
```json
{ ..., "icon": { "online": "<rg2_on>", "offline": "<root>" } }
```
- online: RG-2 has it → use RG-2's
- offline: RG-2 is null → walk to RG-1 → RG-1 has it → use RG-1's

### 9.3 Legacy RG (no icon field)

Setup:
- RG-3 created before this feature ship (Mongo doc has no `icon` field)
- camera C3 in RG-3

GET RG-3 detail → `icon: {online: null, offline: null}` (BE normalize)
GET camera C3 → `icon: {online: null, offline: null}` (resolver finds null up the chain)

### 9.4 Permify filter — internal RG icon hidden in public map

Setup:
- RG-4 (`filterVisibility: "internal"`, icon set)
- camera C4 in RG-4

GET `/kapi/live/map/options` (anonymous) → camera C4 NOT in response (Permify filter excludes internal RGs)
GET `/kapi/resources/camera` (admin) → camera C4 visible with resolved icon from RG-4

### 9.5 Cycle defense

If RG-tree somehow has cycle (shouldn't — Phase C1 guards): resolver bails at depth 10 with `null` and logs warn. No infinite loop.

---

## 10. Decision Log (v0.2 — locked by BE Codex rev 2)

| Decision | Picked Option | Rationale | Date |
|---|---|---|---|
| Q1 storage format | **(b) self-hosted upload only** (MVP-secure bundle) | B6: closes phishing/tracking attack surface entirely; reuses `internal/infra/s3` (NB7) | 2026-05-01 |
| Q2 inheritance | **(b) cascade up parent chain** | Intuitive admin UX: "set icon at root → all descendants inherit" | 2026-05-01 |
| Q3 resolver location | **(a) BE-resolved on camera response** | Single source of truth; FE simple; cache-friendly server-side; B1-aligned with `GetGroupsForCamerasMap` | 2026-05-01 |
| Q4 image constraints | 500 KB; PNG/JPEG/WebP; 16-256 px square recommended | tunable via `KLYNX_ICON_MAX_SIZE_BYTES` / `KLYNX_ICON_MIN_DIM` / `KLYNX_ICON_MAX_DIM` | 2026-05-01 |
| Q5 multi-resource type | **(a) camera-only MVP** | Map view is camera-centric; kcontrol/edge no map yet | 2026-05-01 |
| Q6 URL allowed schemes/origins | **(c) self-hosted only** (paired with Q1=b per MVP-secure bundle) | B6: only host = `KLYNX_ICON_CDN_HOST`, scheme = https; closes external-URL attack surface | 2026-05-01 |
| Q7 SVG policy | **(a) reject SVG entirely** (raster only) | XSS-critical; magic-byte sniff at upload rejects `image/svg+xml` | 2026-05-01 |
| Q8 error envelope | per CLAUDE.md standard `{code, message, details, status: false}`, **all 400-family** (NB5) | matches existing klynx-api convention; `ICON_LOAD_FAILED` 422 dropped per v0.2 | 2026-05-01 |
| Q9 FE fallback | **(a) silent fallback to default + 1 console warn per unique URL** | UX: broken icons distract; warn helps debug | 2026-05-01 |
| **Multi-RG-per-camera (B2 NEW)** | **lex-first wins** (sort RGs by groupId asc, take first; walk parent chain) | O(depth); deterministic; admin docs explain "set the icon at the canonical RG" | 2026-05-01 |
| **Storage shape on POST/PATCH absent (B4 NEW)** | **don't write `icon` to Mongo** when omitted; response normalizer produces `{null,null}` | B4: aligns with §9 "no migration" promise | 2026-05-01 |
| **Validation flow (B3 NEW)** | **Single partial-GET sync at upload endpoint only** (≤64KB, magic-byte sniff + DecodeConfig in one read) | B3: simpler than HEAD-then-GET; Q1=b makes external HEAD/GET probe moot | 2026-05-01 |
| **`mapVisibility` interaction (B5 NEW)** | **Icons exposed on `mapVisibility=public` cross-org reads** (Q6=c is the load-bearing control) | B5: presentation consistency; klynx-CDN is the only host so no tracking-pixel risk | 2026-05-01 |

---

## See also

- Plan: `docs/plan/resource-group-custom-icons.md`
- Permission profile camera grants Phase 2 contract: `docs/contracts/permission-profile-camera-grants.md` — error envelope reference
- Phase C1 RG hierarchy contract (if separate): see `docs/contracts/` or related Phase C plan
- FE-local proposal: `klynx-feature/docs/contracts/resource-group-custom-icons.md` (DRAFT)

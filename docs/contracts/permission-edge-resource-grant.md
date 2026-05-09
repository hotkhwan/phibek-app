# Contract — Permission Edge Resource Grant

**Plan:** [docs/plan/done/permission-edge-resource-grant.md](../plan/done/permission-edge-resource-grant.md)
**Owner:** klynx-api
**Status:** Superseded by [`permission-profile.md`](./permission-profile.md) on 2026-05-04 — edge-grant + camera-grants + member-scope merged into one Permission Profile lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All edge-specific behavior preserved verbatim: `GET /api/v3/resources/edge` picker (§5.4 of merged), `PATCH .../{id}` with `edges` field (§5.1), `GET /api/v3/system/edge` filter behavior change (§5.6), `edgeIds` response-only key reject guard, `system_edges` Mongo collection + `isDeleted: { $ne: true }` soft-delete signal, `organization.manage` Permify probe, `404 NOT_FOUND "edge not found: <edgeId>"` validation error, no Permify schema bump (read-time-only via `directGrantsByEntityType("edge")` per rev 2 correction), tightening note for non-admin callers without profile binding, and the rev 2 corrections vs original draft (`permission.manage` → `organization.manage`; ObjectID → edgeId UUID; `deletedAt: null` → `isDeleted: { $ne: true }`; `400 INVALID_EDGE_ID` → `404 NOT_FOUND`). Body kept here for PR / Codex review history.
**Date:** 2026-05-03
**Versions affected:**
- BE: minor bump 4.18.0 → 4.19.0 (additive); FE: minor bump (new resource type in Resource Permission tab)

> **rev 2 corrections (2026-05-03):** Codex review of PR #155 flagged contract / implementation drift —
> the original draft described an architecture that was simpler than what shipped. This revision
> aligns the contract with the as-shipped behaviour (single source of truth for FE / ops):
> - **Mongo collection:** `system_edges` (not `edge_devices`) — already the operational store
>   used by `/system/edge` since 4.x; identity field is `edgeId` (UUID), not `_id` (ObjectID).
> - **Soft-delete signal:** `isDeleted: { $ne: true }` (not `deletedAt: null`).
> - **Auth probe:** `organization.manage` (Permify permission name on `entity organization`,
>   matches every other admin-only surface in this repo). The legacy phrase `permission.manage` was
>   shorthand the draft inherited from gateway-api docs; klynx-api never had that permission.
> - **Validation error:** `404 NOT_FOUND` with message `edge not found: <edgeId>` (returned by
>   `authzsvc.ErrNotFound` via `handlePermProfileErr` — same path used for unknown camera /
>   kcontrol / orgUnit / resourceGroup ids in PATCH bodies). NOT `400 INVALID_EDGE_ID`.
> - **No Permify tuples written for direct edge grants.** Direct grants are stored on
>   `permission_profiles.edgeIds` and read at request time via `directGrantsByEntityType("edge")`
>   in the resolver — same pattern v4.14.0 introduced for `MemberIDs`. The `edge` entity in
>   `internal/services/authzsvc/schema.perm` already exists for `parentOrg` / `parentGroup`
>   permissions; no schema bump.
> - **No `X-Edge-Filter-Applied` debug header.** Removed from contract; FE never depended on it.
> - **Rollback on edge-grant failure** is "Mongo write fails → 404 with no partial state" (no
>   tuple cleanup needed, since no tuples are written).

---

## 1. Endpoint Surface

Three endpoints are added or changed by this contract.

### A) `GET /api/v3/resources/edge` *(new)*

Paginated list of edge devices in the active org. Used by the Resource Permission slideover
("Edge" tab) to render the picker. Mirrors `GET /api/v3/resources/camera` and `/api/v3/resources/kcontrol`.

**Auth:** Bearer JWT + `X-Active-Org` header. Caller must hold `organization.manage` on the
active org (i.e. owner / admin role per Permify schema `permission manage = owner or admin`).
The route uses standard `AuthBearer + ActiveOrg` middleware **and** the controller does an
explicit `CheckPermissionWithSchemaVersion(... "organization", orgId, "manage", "user", callerId)`
probe before serving — non-admins get 403 even if the route ever loosens its middleware.

**Query params:**

| Name | Type | Default | Required | Notes |
|---|---|---|---|---|
| `page` | int | 1 | no | 1-based page |
| `perPage` | int | 10 | no | max 100 (clamped via `utils.PerPage`) |
| `search` | string | "" | no | substring match on `name` (case-insensitive, regex-quoted via `regexp.QuoteMeta`) |
| `approved` | bool | true | no | reserved; mirrors `/resources/camera` for forward compat (currently ignored) |
| `type` | enum | `""` | no | optional filter `svms` / `ata` / `iboc`; `""` = all types; invalid value → `400 BAD_REQUEST` |

**Success response (200):**

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "items": [
      {
        "id": "edge_01J...",
        "type": "ata",
        "name": "ATA-Bangkok-01",
        "url": "https://ata.example.local",
        "tls": true,
        "createdAt": "2026-05-01T07:00:00Z",
        "updatedAt": "2026-05-02T03:12:00Z"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "perPage": 10,
    "totalRecords": 7,
    "totalPages": 1,
    "sortField": "createdAt",
    "sortOrder": "desc"
  }
}
```

**Notes:**
- `id` is the edge's `edgeId` UUID (the same value stored on `permission_profiles.edgeIds` and
  consumed by the `/system/edge` filter). The Mongo `_id` (ObjectID hex) is **not** exposed by
  this endpoint — operational pages that need it use `/system/edge` instead.
- The picker shows `name + type`. `username`, `apiKey`, `apiSecret`, `passEnc`, `apiSecretEnc`
  are intentionally NOT included (projection-stripped at the repo layer).
- Empty list returns `details.items: []` and `pagination.totalRecords: 0` (NOT 404).
- Sort is fixed to `createdAt desc` for v1 (no client-driven sort).

**Error envelope:**

```json
{ "code": "FORBIDDEN", "message": "...", "status": false, "details": null }
```

| Status | code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | unsupported `type` query param (not in `ata|svms|iboc`) |
| 401 | `UNAUTHORIZED` | missing/invalid Bearer |
| 403 | `FORBIDDEN` | missing `X-Active-Org` header, OR caller lacks `organization.manage` on active org |
| 500 | `INTERNAL_ERROR` | repo / db error (reason: `LIST_FAILED` or `PERMISSION_CHECK_FAILED`) |

---

### B) `GET /api/v3/orgs/resource/permissions/{profileId}` *(updated)*

Adds `edgeIds: string[]` to the response detail.

**Auth:** Bearer + `X-Active-Org` + `organization.manage` (same gate as the existing
camera / kcontrol PATCH path).

**Success response (200):**

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "id": "prof_01J...",
    "name": "Operations team — Cameras + KControls + Edges",
    "description": "...",
    "menuIds": ["dashboard", "biDash", "systemDevices"],
    "cameraIds": ["cam_..."],
    "kcontrolIds": ["kc_..."],
    "resourceGroupIds": ["rg_..."],
    "edgeIds": ["edge_01J...", "edge_02K..."],
    "orgUnitIds": [],
    "memberIds": [],
    "includeOrgUnitChildren": false,
    "includeResourceGroupChildren": false,
    "createdAt": "2026-04-12T10:00:00Z",
    "updatedAt": "2026-05-03T08:00:00Z"
  }
}
```

**Backward compat:** `edgeIds` is additive. Older FE bundles ignore the new field. Profiles
without any edge grants return `edgeIds: []` (NOT omitted; `authzrepo.PermissionProfileRepo.Insert`
explicitly defaults the field to `[]` on first write, mirroring the v4.7.0 `cameraIds` /
`kcontrolIds` initialization). Legacy documents missing the field decode as `nil` slice — JSON
encoder marshals as `[]` because the model field has no `omitempty` tag.

The list endpoint `GET /api/v3/orgs/resource/permissions` mirrors the same field on each item.

---

### C) `PATCH /api/v3/orgs/resource/permissions/{profileId}` *(updated)*

Accepts a new optional `edges` field (string array of edge UUIDs).

**Auth:** Bearer + `X-Active-Org` + `organization.manage`.

**Request body (Phase 2 + Edge):**

```json
{
  "name": "Operations team — Cameras + KControls + Edges",
  "description": "Daytime ops",
  "menus": ["dashboard", "biDash", "systemDevices"],
  "cameras": ["cam_..."],
  "kControls": ["kc_..."],
  "resourceGroups": ["rg_..."],
  "edges": ["edge_01J...", "edge_02K..."],
  "orgUnits": [],
  "memberIds": [],
  "includeOrgUnitChildren": false,
  "includeResourceGroupChildren": false
}
```

**Field semantics:**

| Field | Type | Required | Semantics |
|---|---|---|---|
| `edges` | `string[]` | no | full replace of edge grants. `[]` clears all edge grants. Field omitted = no change (nil-keep, same as `cameras` / `kControls` / `memberIds`). |

**Validation:**

- Each id in `edges` must:
  1. Match an existing edge document in the `system_edges` collection scoped by `X-Active-Org`
  2. Not be soft-deleted (`isDeleted: { $ne: true }`)
- The first id that fails either check returns `404 NOT_FOUND` immediately (fail-fast — no
  partial Mongo write, no batched `invalidIds` array). Mirrors the existing camera / kcontrol
  validation path in `PermissionProfileService.Update`.

```json
{
  "code": "NOT_FOUND",
  "message": "not found: edge not found: edge_xxx",
  "status": false
}
```

The double-prefix (`not found: edge not found: ...`) is the same shape produced by the
camera / kcontrol / orgUnit validation — `authzsvc.ErrNotFound` wraps the per-id failure via
`fmt.Errorf("%w: edge not found: %s", ErrNotFound, edgeId)` and `handlePermProfileErr` writes
the wrapped string verbatim. FE: parse on the inner phrase (`edge not found: <id>`).

**Write contract:**

1. Mongo updates `permission_profiles.edgeIds` (and the other fields the PATCH body resolved)
   in a single `$set` via `PermissionProfileRepo.Update`.
2. **No Permify tuple writes** for direct edge grants. The resolver
   (`MemberAccessService.ResolveViewableEntityIDs("edge")`) reads `profile.EdgeIDs` directly
   via the pure helper `directGrantsByEntityType` — same read-time-only pattern v4.14.0
   established for `MemberIDs`. This intentionally diverges from the camera / kcontrol grant
   write path (which writes `entity:id#viewer@orgUnit:OU` tuples in addition to the Mongo
   field) because:
   - The `/system/edge` filter goes through the resolver — tuples would be redundant.
   - The existing `edge` entity in `internal/services/authzsvc/schema.perm` only declares
     `parentOrg` / `parentGroup` / `creator` relations; it has no `viewer @orgUnit` slot and
     adding one is a schema bump that crosses ops coordination scope (see §2 below).
3. If the Mongo write fails, the service returns the underlying error → controller returns
   `500 INTERNAL_ERROR`. No tuple cleanup is needed since no tuples were written.

**Success response (200):** same as `GET .../{profileId}` after update. Body omits envelope's
`pagination` field (single resource).

**Error envelope:**

| Status | code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | malformed JSON body, missing required fields, OR caller sent the response-only key `edgeIds` (loud guard `rejectEdgeIdsOnRequest` returns `400` with hint `use 'edges' (request field) — 'edgeIds' is a response-only field name`) |
| 400 | `BAD_REQUEST` | also catches `cameraIds` (existing Phase 2a guard, `code: CAMERA_DIRECT_GRANTS_UNSUPPORTED`) |
| 401 | `UNAUTHORIZED` | missing/invalid Bearer |
| 403 | `FORBIDDEN` | caller lacks `organization.manage` on active org |
| 404 | `NOT_FOUND` | one or more edge ids invalid (see above) — also fires for unknown profile id, unknown orgUnit / resourceGroup / kcontrol / camera id, or unknown member id |
| 500 | `INTERNAL_ERROR` | mongo error |

There is no `409 PROFILE_VERSION_CONFLICT` for this surface — `permission_profiles` does not
carry a `version` field; concurrent PATCH-PATCH lands as last-write-wins (mirrors existing
camera / kcontrol behaviour).

---

### D) `GET /api/v3/system/edge` *(behavior changed)*

Existing endpoint. Behavior change: applies per-profile edge grant filter for non-admin callers.

**Auth:** Bearer + `X-Active-Org`.

**Filter logic (as implemented in `internal/services/systemsvc/edgesvc/listEdge.go`):**

```text
1. Resolve userId, orgId, tenantId from auth context.
2. If orgId is empty → 403 (existing behaviour).
3. Probe Permify: organization.manage on (orgId, callerId).
   - true  → return all non-soft-deleted edges in the org (no allowedIDs filter).
   - false → call edgeAccessResolver.ResolveViewableEntityIDs(tenantId, orgId, userId, "edge").
     The resolver:
       a. Loads user's direct + descendant orgUnits (existing Phase A path).
       b. Loads active permission profiles whose orgUnitIds intersect that set (with
          IncludeOrgUnitChildren expansion + memberIds narrowing applied).
       c. Returns the union of profile.EdgeIDs across the surviving profiles
          (via directGrantsByEntityType("edge")).
       d. Empty union → returns [].
     Note: there is no group-mediated path for edges (no parentGroup tuples are walked
     for the "edge" entityType in the resolver — the read step 5 only handles tuples
     where Entity.Type == entityType; edges register parentOrg + creator tuples at
     create-time but no parentGroup tuples, so the loop produces no extra ids).
4. Apply the edge type / search / orgId filter PLUS:
   - if allowedIDs is non-nil → filter["edgeId"] = { $in: allowedIDs }
   - allowedIDs == [] (empty slice) → query returns zero rows
   - allowedIDs == nil (admin path) → no edgeId filter, full org list
5. Pagination is applied AFTER the filter (totalRecords reflects filtered count, not org total).
```

**Behaviour for callers without any active permission profile** (e.g. service accounts not on
the admin path, fresh users post-invite who have not yet been bound to a profile):
- `ResolveViewableEntityIDs` returns `[]` → filter yields zero edges.
- This is a **tightening** vs pre-4.19.0 behaviour, where the same caller would have seen the
  full org list. CHANGELOG entry filed under `### Changed` — operators must verify profile
  coverage before deploying. Mirrors the v4.14.0 `MemberIDs` rollout note for own-org streaming.

**Response shape:** unchanged. Same envelope as today.

**No FE debugging header.** The Codex draft proposed `X-Edge-Filter-Applied: true`; not shipped
because (a) FE never wired against it, (b) the org-admin probe already differentiates the two
paths via the response itself (admin sees full list; non-admin sees subset). FE that needs
filter-applied diagnostics can compare `pagination.totalRecords` against the unauthenticated
admin baseline.

---

## 2. Permify Schema — No Change

The `edge` entity already exists in `internal/services/authzsvc/schema.perm` (added in 4.x for
the parentOrg / parentGroup / creator relations consumed by `edgesvc.CreateEdge` and the
existing operational permission checks):

```permify
entity edge {
    relation parentOrg   @organization
    relation parentGroup @resourceGroup
    relation creator     @user

    permission view   = parentGroup.view or parentOrg.manage
    permission edit   = parentGroup.edit or parentOrg.manage
    permission delete = parentGroup.delete or parentOrg.manage
    permission sync   = parentOrg.manage
}
```

**No `viewer @orgUnit` relation is added** — direct edge grants are read-time-only via the
resolver path. Mirrors v4.14.0 `MemberIDs` (which is also read-time-only with no schema bump).

If a future phase wants to expose direct-edge-grant checks via Permify `Check(edge:X view user:U)`
RPC (e.g. for service-account flows or ad-hoc audit), that phase opens its own plan + schema
addendum and writes the migration tuples. Until then, the resolver is the single source of
truth for "which edges does this non-admin user see."

---

## 3. Profile Detail Type — FE Source of Truth

FE consumes this shape. Treat absent fields as `[]`, not `undefined`, when calling PATCH (so
users can explicitly clear grants).

```ts
// FE type (klynx-feature)
export type ResourcePermissionProfileDetail = {
  id: string
  name: string
  description: string
  menuIds: string[]
  cameraIds: string[]
  kcontrolIds: string[]
  resourceGroupIds: string[]
  edgeIds: string[]            // ← NEW
  orgUnitIds: string[]
  memberIds: string[]
  includeOrgUnitChildren: boolean
  includeResourceGroupChildren: boolean
  createdAt: string
  updatedAt: string
}
```

PATCH body type:

```ts
export type ResourcePermissionProfilePatch = {
  name?: string
  description?: string
  menus?: string[]
  cameras?: string[]
  kControls?: string[]
  resourceGroups?: string[]
  edges?: string[]             // ← NEW
  orgUnits?: string[]
  memberIds?: string[]
  includeOrgUnitChildren?: boolean
  includeResourceGroupChildren?: boolean
}
```

Note the request / response asymmetry on the edge field name (`edges` request, `edgeIds`
response) mirrors `cameras` ↔ `cameraIds` and `kControls` ↔ `kcontrolIds`. Sending the
response-only `edgeIds` key on PATCH is rejected with `400 BAD_REQUEST` and an actionable
hint (see §1.C error table).

---

## 4. Test Vectors

### 4.1 Empty grant (clear)

```text
PATCH .../prof_X
body: { "edges": [] }
→ 200, details.edgeIds = []
→ Mongo: permission_profiles.edgeIds = [] (no Permify tuples are touched — none were written).
→ subsequent GET /system/edge as non-admin user bound to prof_X returns items: [].
```

### 4.2 Add grant

```text
PATCH .../prof_X
body: { "edges": ["edge_A", "edge_B"] }
→ 200, details.edgeIds = ["edge_A", "edge_B"]
→ Mongo: permission_profiles.edgeIds = ["edge_A", "edge_B"].
→ GET /system/edge as user bound to prof_X (non-admin) returns items: [{ id: "edge_A", ... }, { id: "edge_B", ... }].
```

### 4.3 Unknown / soft-deleted edge id

```text
PATCH .../prof_X
body: { "edges": ["edge_A", "edge_DELETED"] }
→ 404, code: NOT_FOUND, message: "not found: edge not found: edge_DELETED"
→ Mongo NOT mutated (validation runs before the $set; first failing id aborts).
→ Note: order-sensitive — if "edge_DELETED" appears first the message names it; if "edge_A" is bad
  it's named instead. FE should not parse the index — only the id name in the message.
```

### 4.4 Admin bypass

```text
GET /system/edge as user with organization.manage (owner / admin)
→ 200, items: <all non-soft-deleted edges in org>, no resolver call.
→ Response shape unchanged from pre-4.19.0 admin path.
```

### 4.5 No profile binding (non-admin)

```text
GET /system/edge as user with no permission profile bound
  AND no organization.manage
→ 200, items: []
→ This is the tightening change — pre-4.19.0 returned the full org list.
```

### 4.6 Filter narrows pagination total

```text
Org has 50 edges. User bound to profile with edgeIds=[3 ids].
GET /system/edge?perPage=10
→ pagination.totalRecords = 3 (NOT 50)
→ pagination.totalPages = 1
→ items.length = 3
```

### 4.7 Response-only key reject (loud-fail guard)

```text
PATCH .../prof_X
body: { "edgeIds": ["edge_A"] }
→ 400, code: BAD_REQUEST,
   message: "use 'edges' (request field) — 'edgeIds' is a response-only field name; see docs/contracts/permission-edge-resource-grant.md §1.C"
→ Mongo NOT mutated. Mirrors the Phase 2a `cameraIds` guard (different code constant but same intent).
```

### 4.8 Picker non-admin reject

```text
GET /api/v3/resources/edge as non-admin user (no organization.manage)
→ 403, code: FORBIDDEN, message: "caller lacks organization.manage on active org"
```

---

## 5. Resolved decisions (formerly Open Questions in draft)

| # | Question | Resolution shipped in 4.19.0 |
|---|---|---|
| 1 | Permify schema location for the `edge` entity | **N/A — no schema bump.** Direct edge grants are read-time only. Existing entity already covers parentOrg / parentGroup / creator relations consumed by `edgesvc.CreateEdge` and Permify Check calls. See §2. |
| 2 | Service-account flow on `/system/edge` | Same admin-role probe (`organization.manage`) applies. Service-account tokens with admin role return all edges; without admin role they go through the resolver (which returns `[]` if there is no profile binding for the underlying user, since service accounts typically have no orgUnit membership). Acceptable for v1. |
| 3 | Soft-delete cascade on edge delete | **Deferred.** When an edge is soft-deleted, its id remains on `permission_profiles.edgeIds`. The `/system/edge` filter naturally excludes soft-deleted edges (`isDeleted: { $ne: true }`), so users won't see a stale entry — the orphan id is harmless until the next PATCH. A one-shot cleanup job can trim orphan ids if drift is observed in production listings; not blocking. |
| 4 | Pagination cap | `perPage` clamps to 100 via `utils.PerPage` — same cap as `/resources/camera`. |

---

## 6. Implementation evidence

| Surface | File | Note |
|---|---|---|
| `GET /api/v3/resources/edge` | [controllers/sysapi/edgeapi/listResource.go](../../controllers/sysapi/edgeapi/listResource.go) | New handler; explicit `organization.manage` probe. |
| Picker repo | [internal/repo/edgerepo/edge.go](../../internal/repo/edgerepo/edge.go) | `ListForOrg` (paginated, regex-quoted search, type filter); `FindByEdgeIDAndOrg` (PATCH validation). |
| Route | [router/device.go](../../router/device.go) | Mount `/resources/edge` with AuthBearer + Audit + ActiveOrg. |
| PATCH controller | [controllers/authzapi/resourcePermissions.go](../../controllers/authzapi/resourcePermissions.go) | `+ Edges []string \`json:"edges"\``; `rejectEdgeIdsOnRequest` guard. |
| Service | [internal/services/authzsvc/permissionProfileSvc.go](../../internal/services/authzsvc/permissionProfileSvc.go) | `+ edgeRepo`; `+ EdgeIDs` validation block (mirrors CameraIDs); persist via `bson.M{"edgeIds": validEdgeIDs}`. |
| Resolver dispatch | [internal/services/authzsvc/resolveAccess.go](../../internal/services/authzsvc/resolveAccess.go) | `directGrantsByEntityType` adds `case "edge": return profile.EdgeIDs`. |
| Filter consumer (unchanged signature) | [internal/services/systemsvc/edgesvc/listEdge.go](../../internal/services/systemsvc/edgesvc/listEdge.go) | Existing `EdgeAccessResolver` interface; resolver dispatch is the only delta. |
| Model | [models/authzmod/permissionProfile.go](../../models/authzmod/permissionProfile.go) | `+ EdgeIDs []string \`bson:"edgeIds" json:"edgeIds"\``. |
| Repo default | [internal/repo/authzrepo/permissionProfile.go](../../internal/repo/authzrepo/permissionProfile.go) | Insert defaults `EdgeIDs` to `[]`. |
| Container wiring | [internal/app/container.go](../../internal/app/container.go) | `edgerepo.NewEdgeRepo()` passed to `NewPermissionProfileService`. |
| Tests | [internal/services/authzsvc/resolveAccess_directGrants_test.go](../../internal/services/authzsvc/resolveAccess_directGrants_test.go), [controllers/authzapi/resourcePermissions_edge_guard_test.go](../../controllers/authzapi/resourcePermissions_edge_guard_test.go) | 4 dispatch tests + 7 guard tests; `go test ./...` 42 packages, 0 failures. |

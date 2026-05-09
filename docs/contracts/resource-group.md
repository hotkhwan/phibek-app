# Resource Group Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `resource-group-custom-icons.md` + `resourceGroup-hierarchy.md` + `resource-import-export-roundtrip.md`)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/done/resource-group-custom-icons.md](../plan/done/resource-group-custom-icons.md), [docs/plan/done/camera-icon-phase1.5-map-endpoints.md](../plan/done/camera-icon-phase1.5-map-endpoints.md), [docs/plan/camera-icon-phase1.6-cross-org.md](../plan/camera-icon-phase1.6-cross-org.md), [docs/plan/done/resourceGroup-hierarchy.md](../plan/done/resourceGroup-hierarchy.md), [docs/plan/done/resource-import-export-roundtrip.md](../plan/done/resource-import-export-roundtrip.md), [docs/plan/resource-permission-menu-scope-alignment.md](../plan/resource-permission-menu-scope-alignment.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST + Sync`
**Version:** `v1` (Phase C1 + C2 hierarchy shipped 4.7.0/4.7.2; icons Phase 1+2 shipped 4.12.0; icons Phase 1.5 shipped 4.16.0 PR #147; icons Phase 1.6 cross-org shipped 4.17.0; import/export Phase E1-E3 staged in 4.9.0)
**Supersedes:** `resourceGroup-hierarchy.md` (Phase C1+C2), `resource-group-custom-icons.md` (icons + cross-org resolver), `resource-import-export-roundtrip.md` (round-trip Excel import/export). Each former contract is kept on-disk with `Status: Superseded` markers for PR / consumer history.

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `resource-group` |
| Flow name | RG entity lifecycle: tree shape → presentation metadata (icons) → bulk round-trip |
| Lifecycle scope | create RG with optional parent → set custom icons → camera↔RG membership via Permify tuples → resolved icons returned on camera + map responses → round-trip export → re-import (idempotent unchanged) |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `POST /kapi/resources/groups` | create RG with optional `parentGroupId` + optional `icon` |
| REST | `PATCH /kapi/resources/groups/{id}` | update RG fields (incl. parent, icon) |
| REST | `GET /kapi/resources/groups[/{id}]` | list / detail with `parentGroupId` + `isRoot` (DTO-derived) + `icon` |
| REST | `GET /kapi/resources/groups/{id}/descendants` | BFS subtree query |
| REST | `POST /kapi/resources/icons/upload` | self-hosted icon upload (multipart) — required under Option C |
| REST | `GET /kapi/resources/camera[/{id}]` | camera response with BE-resolved `icon` (lex-first RG → parent walk) |
| REST | `GET /kapi/map/camera`, `/kapi/map/camera/cluster`, `/kapi/live/map`, `/kapi/live/map/options` | map endpoints with same `icon` resolution |
| REST | `PATCH /kapi/orgs/resource/permissions/{id}` | adds `includeResourceGroupChildren` flag (Phase C2) |
| REST | `GET /resources/camera/export`, `/template`, `POST /resources/camera/import` | bulk round-trip XLSX |
| REST / Sync rule | ResourceGroup public/private camera override | group state changes and add-device/import flow update camera `mapVisibility`; latest group assignment/change wins |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| Camera CRUD (`POST/PATCH/GET /kapi/resources/camera`) | covered by future Camera Domain merge (Cluster #1) | (audit Cluster #1 — pending) |
| Permission profile read-side resolver beyond C2 flag | full resolver lives in `permission-profile-camera-grants.md` | sibling contract |
| `camera.password` migration tooling | dedicated audited surface (out of scope here) | (separate audited surface) |
| Cross-org tree (RG in org A nested under RG in org B) | forbidden by §3 write-authority policy | n/a |
| `gw.events.normalized.v1` | unrelated upstream | (gateway-api SoR) |

### Related Contracts

| Contract | Relationship |
|---|---|
| Future `device-camera-domain.md` (Cluster #1 merge) | sibling — camera CRUD covered there; this contract owns RG-side data + camera response icon field + round-trip import that ALSO touches cameras |
| [`permission-profile-camera-grants.md`](./permission-profile-camera-grants.md) | sibling — permission profile read-side resolver consumes the `includeResourceGroupChildren` flag defined here in §5.5 |
| [`camera-import-canonical.md`](./camera-import-canonical.md) | predecessor — v1 import-only contract; round-trip §5.6 supersedes its import path. Kept as-is in Cluster #1 (camera domain) until merged there |

### Grouping Rationale

All three source contracts mutate the same `resource_groups` Mongo collection:
- hierarchy adds `parentGroupId` + tree validation
- icons adds `icon` field + resolver across 5 endpoints + upload endpoint
- round-trip imports/exports the entire RG (incl. parent + icon fields)

The lifecycle is one chain: an admin creates the tree shape, decorates it with icons, exports/imports it, and the resolver reads from it. A reader of any one source contract alone cannot understand the round-trip idempotency rule (it depends on the tree-shape three-state parent semantics from hierarchy AND the icon field omit-vs-null semantics from icons). Per `docs/contracts/README.md` grouping rule, these are one flow → one contract.

---

## 1. Purpose

Defines the full lifecycle of the `resource_groups` entity:

- **Tree shape (Phase C1, shipped 4.7.0):** `parentGroupId` nesting with cycle / self-parent / cross-org parenting validation; `isRoot` is response-time DTO-derived (never persisted) so legacy docs without `parentGroupId` deserialize to `nil` → `isRoot=true`.
- **Read-side opt-in flag (Phase C2, shipped 4.7.2):** `includeResourceGroupChildren` on permission profiles; resolver expands `profile.ResourceGroupIDs` to all descendants when true.
- **Custom icons (Phase 1+2, shipped 4.12.0):** `icon: IconBundle{online, offline}` field on RG; BE-resolved on camera response via lex-first RG + parent walk; self-hosted upload endpoint.
- **Map endpoint icon resolution (Phase 1.5, shipped 4.16.0):** same `icon` field on 5 camera/map DTOs; cross-org cameras initially `{null,null}`.
- **Auth'd cross-org icon resolution (Phase 1.6, shipped 4.17.0):** group-by-org bulk resolver for cross-org public cameras on `/kapi/map/camera` + auth'd `/kapi/live/map`. Anon `/kapi/live/map` cross-org still `{null,null}` pending v1.7 product sign-off.
- **Bulk round-trip (Phase E1-E3, staged 4.9.0):** XLSX export/template/import for cameras + resource groups; idempotent unchanged outcome via field+tuple diff; migration mode for create-with-provided-id.

`klynx-api` publishes this as source of truth; `klynx-feature` must implement against it and must not infer column names, error codes, sheet schemas, icon URL allowlist, validation rules, or resolver semantics from code or screenshots.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| ResourceGroup tree shape | `klynx-api` | `klynx.resource_groups` | `parentGroupId` lives here; `isRoot` derived response-time |
| ResourceGroup icon | `klynx-api` | `klynx.resource_groups.icon` (additive) | legacy docs without field → `{null,null}` at read |
| Klynx camera projection | `klynx-api` | `klynx.camera` | round-trip writer (create + update) |
| Camera→Org / Camera→ResourceGroup tuples | `klynx-api` (writer) / Permify (store) | Permify | round-trip delta-writes RG tuples; never modifies Org tuple |
| ResourceGroup→Org tuple | `klynx-api` (`ResourceGroupService.Create`) | Permify | written once at create; required for resolver visibility |
| External-source camera fields | `gateway-api` | `klynx.camera.externalSource` | read-only on round-trip update; reject `CAMERA_GW_MANAGED` |
| Icon binary objects | MinIO via `internal/infra/s3` | `icons/{orgId}/{sha256}.{ext}` | klynx-CDN-fronted via `KLYNX_ICON_CDN_HOST` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST/PATCH /kapi/resources/groups` | klynx-api `ResourceGroupService` | klynx-feature | Phase C1 fields + icon |
| `GET /kapi/resources/groups[/{id}]` | klynx-api | klynx-feature | response-time `isRoot` + `icon` normalize |
| `GET /kapi/resources/groups/{id}/descendants` | klynx-api | klynx-feature | BFS, no pagination v1 |
| `POST /kapi/resources/icons/upload` | klynx-api `IconUploadService` | klynx-feature (admin) | multipart, sha256-keyed S3 object |
| `GET /kapi/resources/camera[/{id}]` | klynx-api `CameraService.ListCameras` | klynx-feature | `icon` resolved lex-first + parent walk |
| `GET /kapi/map/camera`, `/cluster`, `/kapi/live/map` (auth'd) | klynx-api | klynx-feature | full resolver on org-owned + cross-org public (4.17.0) |
| `GET /kapi/live/map` (anon) | klynx-api | klynx-feature anon | `{null,null}` for every item until v1.7 |
| `GET /kapi/live/map/options` (anon) | klynx-api | klynx-feature anon | RG own `Icon` passthrough — no cascade |
| `PATCH /kapi/orgs/resource/permissions/{id}` | klynx-api `MenuPermissionProfileSvc` | klynx-feature | Phase C2 flag |
| `GET /resources/camera/{export,template}` | klynx-api `CameraService.ExportOrg` | klynx-feature (download) | XLSX bytes |
| `POST /resources/camera/import` | klynx-feature | klynx-api `CameraService.ImportRoundTrip` | multi-sheet round-trip |

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Phase C1 (parentGroupId):** additive. Pre-C1 docs without `parentGroupId` → deserialize `null`, `isRoot=true`. No backfill.
- **Phase C2 (`includeResourceGroupChildren`):** additive. Pre-C2 profiles → field deserializes to `false`, resolver behavior unchanged.
- **Icons Phase 1+2:** fully additive. Legacy RG without `icon` field → response normalize to `{online:null, offline:null}`. Pre-feature FE that ignores `icon` continues to work.
- **Icons Phase 1.5/1.6:** additive new field on map DTOs. Cross-org cameras get `{null,null}` in v1.5; full resolution lands 1.6 (auth'd) and 1.7 (anon, deferred).
- **Round-trip Phase E1-E3 — request shape additive, response semantics breaking v1→v2:**
  - Request additive: legacy file shape still accepted — CSV without `id` column or XLSX without `ResourceGroups` sheet routes through `id`-empty create branch. Legacy callers without `allowCreateWithProvidedIds` form field default to `false` (safe).
  - Response semantic change: in-DB IP duplicate is **no longer a per-row reject**; it is a non-blocking `warnings.duplicateIPInDB`. Rows with duplicate IPs WILL insert in v2 where they did NOT in v1. Hard-cutover at the v4.9.0 deploy. FE callers that gated on `error` containing `DUPLICATE_IP_IN_DB` must migrate to `warnings.duplicateIPInDB`.
  - New additive fields: `outcome ∈ {"created","updated","unchanged","rejected"}`, `details.unchanged`, `details.groupsUnchanged`, `details.results[].warnings.*`.

### Replay / Re-sync Behavior

- **CRUD endpoints:** GET idempotent; POST not idempotent (creates new ID); PATCH is idempotent within the validation envelope.
- **Round-trip:** re-importing an unmodified export file is idempotent. Every row `outcome="unchanged"`; no Mongo writes, no `revision++`, no Permify churn. Detection is field-level diff + tuple-set diff; both must be empty for `unchanged`.
- **Replay supported:** yes for round-trip; no for one-shot create-only flows (those are still rejected on duplicate id when create-with-id is requested).
- **Re-sync trigger:** none built-in. If Permify tuple write fails after Mongo update, `permifySyncFailed[]` is surfaced; operator manually re-saves the camera through UI to repair tuple state.
- **Concurrent imports:** serialized per `(tenantId, orgId)` via 5-min-TTL Mongo advisory lock; second concurrent call → `409 IMPORT_IN_PROGRESS`.

### Write Authority Policy

- `klynx-api` is the sole writer of `klynx.resource_groups`, `klynx.camera`, and the Permify tuples for camera↔RG and ResourceGroup→Org.
- `camera.externalSource` and any `gw*`-prefixed fields → read-only on import update path. Round-trip update of a row whose `externalSource != nil` → reject `CAMERA_GW_MANAGED`.
- `camera.password`: on create encrypted via `utils.EncryptWithKeyringJSON`; on update empty cell = preserve, non-empty = re-encrypt; never returned on export.
- **Cross-org parenting forbidden:** `parentGroup.tenantId == self.tenantId && parentGroup.orgId == self.orgId` is enforced; cross-org → `PARENT_NOT_FOUND` (defense by ambiguity).
- **Visibility does NOT inherit** (D3): each group declares its own `mapVisibility` and `filterVisibility`. A child of an `internal` parent can be `public`, and vice versa.
- **ResourceGroup public/private camera override is shipped in v1.1:** RG `mapVisibility` overwrites camera `mapVisibility` when a group is changed, when a camera is added to a group, and when imported cameras resolve into groups. This is explicit write behavior, not inheritance.
- **Migration mode** (`allowCreateWithProvidedIds=true`): double-gated — env `IMPORT_ALLOW_PROVIDED_IDS_GLOBAL=true` AND request-time form field both required; UUIDv4 shape validated; rate-limited 1/60s per `(tenantId, orgId)`; every row audit-logged as `cameraImport.createdWithProvidedId` / `groupImport.createdWithProvidedId`.

### Revision History (preserved verbatim from source contracts)

**Hierarchy (`resourceGroup-hierarchy.md`):**
- Phase C1 shipped (4.7.0): `parentGroupId` write path + descendants endpoint; `isRoot` DTO-derived (Codex blocker fix from PR #77 — was incorrectly stored in v0); collection name `resource_groups` (was incorrectly `device_groups` in plan §4); name uniqueness kept **per-org** (rejected per-parent as scope creep).
- Phase C2 shipped (4.7.2): resolver descendant expansion via `includeResourceGroupChildren`; mirrors Phase A `includeOrgUnitChildren`; per-rgID errors swallowed (partial expansion preferred over total failure); empty-string descendants filtered defensively; `rgRepo` nil-check graceful.

**Icons (`resource-group-custom-icons.md`):**
- v0.1: external-URL writeable; per-state `IconBundle`; resolver placeholder.
- v0.2 (Codex rev 2 lock): MVP-secure bundle (Q1=b + Q6=c); §1.1/§1.2 absent path = don't write (B4); multi-RG lex-first wins (B2); single partial-GET sync at upload only (B3); error code 422→400 (NB5); resolver rewritten on existing primitives `GetGroupsForCamerasMap` + Mongo `parentGroupId` walk (B1); `mapVisibility` row added (B5).
- v0.3: Phase 1.5 map endpoints — same `icon` field on `GET /kapi/map/camera`, `GET /kapi/map/camera/cluster`, `GET /kapi/live/map` (auth'd + anon paths), `GET /kapi/live/map/options`. Cross-org cameras ship `{null,null}` (v1.6 follow-up).
- v0.4 (2026-05-03): flips §6 v1.6 row to shipped (auth'd cross-org, klynx-api 4.17.0) + pins v1.7 anon row pending product sign-off.

**Round-trip (`resource-import-export-roundtrip.md`):**
- rev 1 (2026-05-01): initial v2 round-trip with id-keyed upsert + idempotent unchanged outcome.
- rev 2 (2026-05-01): re-aligned with shipped resourceGroup hierarchy Phase C1 (v4.7.0) + C2 (v4.7.2).

---

## 4. Surface Summary

| Type | Name | Method | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/kapi/resources/groups` | `POST` | Bearer + `X-Active-Org` + `organization.manage` | klynx-api `ResourceGroupService.Create` | klynx-feature |
| REST | `/kapi/resources/groups/{id}` | `PATCH` | Bearer + `X-Active-Org` + `organization.manage` | klynx-api `ResourceGroupService.Update` | klynx-feature |
| REST | `/kapi/resources/groups[/{id}]` | `GET` | Bearer + `X-Active-Org` | klynx-api | klynx-feature |
| REST | `/kapi/resources/groups/{id}/descendants` | `GET` | Bearer + `X-Active-Org` | klynx-api `ResourceGroupService.GetDescendants` | klynx-feature |
| REST | `/kapi/resources/icons/upload` | `POST` | Bearer + `X-Active-Org` + `organization.manage` | klynx-api `IconUploadService` | klynx-feature (admin) |
| REST | `/kapi/resources/camera[/{id}]` | `GET` | Bearer + `X-Active-Org` (or anon via map endpoints) | klynx-api `CameraService.ListCameras` | klynx-feature |
| REST | `/kapi/map/camera`, `/cluster` | `GET` | Bearer + `X-Active-Org` | klynx-api | klynx-feature |
| REST | `/kapi/live/map` | `GET` | optional Bearer | klynx-api | klynx-feature (auth'd or anon) |
| REST | `/kapi/live/map/options` | `GET` | none | klynx-api | klynx-feature anon |
| REST | `/kapi/orgs/resource/permissions/{id}` | `PATCH` | Bearer + `X-Active-Org` + Permify scope | klynx-api `MenuPermissionProfileSvc` | klynx-feature |
| REST | `/resources/camera/export`, `/template` | `GET` | Bearer + `X-Active-Org` + `guardManageOrg` | klynx-api `CameraService.ExportOrg` / `ExportTemplate` | klynx-feature |
| REST | `/resources/camera/import` | `POST` | Bearer + `X-Active-Org` + `guardManageOrg` | klynx-api `CameraService.ImportRoundTrip` | klynx-feature |

---

## 5. REST Surfaces

### 5.1 ResourceGroup CRUD + Tree (Phase C1)

#### `POST /kapi/resources/groups`

**Request body** (additive on existing fields; `parentGroupId` and `icon` are the new optional pieces):

```json
{
  "name": "Bangkok HQ",
  "description": "...",
  "resourceType": "camera",
  "mapVisibility": "private",
  "filterVisibility": "public",
  "includeFilterChildren": false,
  "parentGroupId": "rg-uuid-root",
  "icon": {
    "online":  "https://cdn.klynx.com/icons/bangkok-on.png",
    "offline": "https://cdn.klynx.com/icons/bangkok-off.png"
  }
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | — | unique **per org** (matches `uq_tenant_org_groupName` index in `internal/repo/devicerepo/deviceGroup.go`). Per-parent uniqueness was considered and rejected. Two siblings under different parents must still have different names |
| `resourceType` | string | no | `""` | `"camera"` \| `"sensor"` \| `""` (= container, all types) |
| `parentGroupId` | string | no | `null` | nil = root; if set, target must exist in same `(tenantId, orgId)` |
| `mapVisibility` | string | no | `"private"` | unchanged from existing contract |
| `filterVisibility` | string | no | `"public"` | unchanged from existing Phase B-Lite contract |
| `includeFilterChildren` | bool | no | `false` | Live/resourceGroup filter behavior only. When true, selecting this group in Live/resourceGroup filters includes descendant groups. Does not affect permission-profile expansion |
| `icon` | `IconBundle \| null` | no | omitted | see §5.2 icon body semantics |

**Visibility does NOT inherit from parent (D3).**

**Success (`201`):** standard envelope; `details` is the created RG including `icon: IconBundle` (always present in response — normalized from missing field) and `isRoot` (response-time DTO-derived from `parentGroupId == null`; never persisted).

#### `PATCH /kapi/resources/groups/{id}`

**Request body** (any subset; uses `map[string]any` key-presence detection — same pattern as Phase 1 of camera-grants):

```json
{
  "name": "Bangkok HQ — Renamed",
  "parentGroupId": "rg-uuid-thailand",
  "icon": { "online": "https://cdn.klynx.com/icons/bangkok-on-v2.png" }
}
```

**Three-state semantics for `parentGroupId`:**
- key absent → keep current `parentGroupId`
- key present + `null` → move to root (`parentGroupId = nil`)
- key present + string → move under target (after self/cycle/parent-existence validation)

**Three-state semantics for `icon` (icons §1.2, B4 partial-merge):**
- `icon` field absent → nil-keep, no Mongo write
- `icon: null` → clear → write `{online:null, offline:null}` (explicit clear)
- `icon: { online: "<url>" }` → update online only; offline preserved (read existing → merge → write)
- `icon: { online: null, offline: "<url>" }` → set online to null + offline to URL
- `icon: { online: "<url>", offline: "<url>" }` → replace both
- any URL fails §5.4 validation → 400; no Mongo write

For an RG without an `icon` field in Mongo, partial PATCH (`icon: { online: "<url>" }`) reads `IconBundle{}` zero-value as the existing → merges → writes the resulting `{online:"<url>", offline:null}`.

**`status` field:** unchanged from existing PATCH semantics (BE 4.7.3 nil-keep applies — see [`permission-profile-camera-grants.md`](./permission-profile-camera-grants.md) §1).

**Validation** (service layer, before Mongo write):

| Case | HTTP | code | message |
|---|---|---|---|
| `parentGroupId` = self | 400 | `INVALID_PARENT` | `"cannot parent group to itself"` |
| `parentGroupId` ∈ self's descendants | 400 | `INVALID_PARENT` | `"parent would create cycle"` |
| `parentGroupId` not found in same `(tenantId, orgId)` | 404 | `NOT_FOUND` | `"parentGroup not found: <id>"` |

**Success (`200`):** updated RG with same shape as POST.

#### `GET /kapi/resources/groups[/{id}]`

Returns existing shape extended with `parentGroupId` (string \| null), `isRoot` (bool, DTO-derived), `icon` (always populated `IconBundle`, `{null,null}` for legacy docs).

#### `GET /kapi/resources/groups/{id}/descendants` (Phase C1, NEW)

**Path param:** `id` (UUID, required) — root of the subtree.
**Query param:** `includeSelf` (bool, default `false`) — when `true`, response `items` includes the group identified by `id` as the first entry.

**Success (`200`):** `details.items[]` in BFS order (children before grandchildren). `includeSelf=true` puts the root at index 0.

**Pagination:** none in v1. If a tenant exceeds 1000 descendants, endpoint returns `200` with all items (perf fallback to add `limit`+cursor in follow-up). Tracked via OTel metric `resourceGroup.descendants.{depth,count}`.

**Error:** `404 NOT_FOUND` — `id` not found in active org.

### 5.2 Icon Body Semantics — Type Reference

```ts
type IconBundle = {
  online: string | null   // HTTPS URL (validated per §5.4); null = no override for online state
  offline: string | null  // HTTPS URL (validated per §5.4); null = no override for offline state
}
```

**POST `icon` semantics (B4: don't-write-when-omitted):**

| Value sent | Backend behaviour |
|---|---|
| field absent | **do NOT write `icon` to Mongo doc** — preserves legacy storage shape; response normalizer produces `{null,null}` |
| `null` | normalize to `{null,null}` and write the field (explicit "icon-cleared" doc — same API surface as absent) |
| `{online: "<url>"}` | partial — write `{online:"<url>", offline:null}` |
| `{online: "<url>", offline: "<url>"}` | write both |
| any URL fails §5.4 validation | 400 with appropriate code; no doc created |

**Why nested object:** future-proof namespace. If BE later wants per-state alpha (`recording`, `error`), extend `IconBundle` without touching root fields. Single shape reused everywhere.

### 5.3 Camera Response Icon Resolution (read-only, derived per request)

The `icon: IconBundle` field on camera responses is BE-resolved — never persisted on the camera doc.

#### Resolution rule

| Camera state | Resolution |
|---|---|
| Camera in RG `R` with `R.icon.online != null` | `icon.online = R.icon.online` |
| Camera in RG `R` with `R.icon.online == null` and `R.parentGroupId != null` | walk to `R.parent`, `R.parent.parent`, … until first non-null `icon.online`; else null |
| online and offline are resolved **independently** | each state walks the chain on its own |
| Camera not in any RG, OR no RG in chain has icon | `{null, null}` — FE falls back to default |

**Multi-RG-per-camera (B2: lex-first wins):**

The codebase supports cameras in multiple RGs via `GetGroupsForCamera` returning a list. When camera C is in N>1 RGs:
- Sort C's RGs by `groupId` ascending. Take the **first RG only** (`R0`). Walk `R0`'s `parentGroupId` chain to resolve `online` and `offline` independently. Sibling RGs (`R1`, `R2`, …) are NOT consulted.
- O(depth), not O(N_rgs × depth).
- Deterministic: same camera + same RG set → same `IconBundle`.
- **v2 escape hatch:** if admin feedback demands union-first-non-null, the resolver can be upgraded without breaking the storage shape.

**Cycle defense:** Cycle in `RG.parentGroupId` → resolver bails after walking `MAX_DEPTH=10` levels; logs warn; returns null.

#### Map endpoint coverage

Same `icon: IconBundle` field on the four map / map-options endpoints with identical semantics:

| Endpoint | Auth | DTO | Resolution scope (org-owned `IsOwner=true`) | Cross-org cameras |
|---|---|---|---|---|
| `GET /kapi/map/camera` | Bearer + X-Active-Org | `MapCameraItem` | full resolver | **`{null,null}` in v1.5; resolved in v1.6 (4.17.0)** via group-by-org bulk resolver |
| `GET /kapi/map/camera/cluster` | Bearer + X-Active-Org | `MapCameraItem` (in `devices[]`) | same as above | same |
| `GET /kapi/live/map` (auth'd, `X-Active-Org` set) | optional Bearer | `MapCameraItem` | full resolver | resolved in v1.6 (4.17.0) — auth'd path |
| `GET /kapi/live/map` (anon path) | none | `PublicCameraItem` | resolver disabled | every item: `{null,null}` (v1.7 target — pending product sign-off; tracking-pixel mitigation already in place via §5.4 Option C) |
| `GET /kapi/live/map/options` | none | `GroupOption` | RG own `Icon` passthrough — **no cascade**, no resolver | n/a (RG, not camera) |

**Why cross-org `{null,null}` in v1.5 then resolved in v1.6:** the existing bulk resolver `GetGroupsForCamerasMap(tenantId, orgId)` is org-scoped. Cross-org public cameras come from N other orgs — naive resolution would be N Permify scans (auth'd `/live/map`) or per-camera lookup (anon `/live/map`, N+1). Phase 1.5 shipped org-scoped only; Phase 1.6 added group-by-org bulk path (one Permify scan per distinct camera-source orgId).

**Why `/kapi/live/map/options` is RG own (not cascade):** the dropdown shows a single RG entry, not a camera. Cascade is meant for camera-under-the-RG resolution. Internal-visibility RGs are still excluded from this surface by the existing B-Wire `filterVisibility != "internal"` filter.

#### Resolver pseudo-code (v0.2 — B1: rewritten on existing primitives)

Existing primitives consumed:

| Primitive | Returns | Use |
|---|---|---|
| `MemberAccessService.ResolveViewableEntityIDs(orgId, userId, "camera")` | `[]string` | Permify-filter step |
| `ResourceGroupService.GetGroupsForCamerasMap(ctx, tenantId, orgId)` | `map[camId][]ResourceGroup` (bulk; ONE Permify scan) | replace v0.1's per-camera Permify call |
| `ResourceGroupRepo.FindByIDAndOrg(ctx, rgId, tenantId, orgId)` | `*ResourceGroup` | walk `parentGroupId` chain |

```go
// pkg: internal/services/devicesvc (NB1 fix — was wrongly camerasvc in v0.1)
func (s *CameraService) resolveCameraIcons(
    ctx context.Context, tenantId, orgId string, cameraIDs []string,
) (map[string]IconBundle, error) {
    // 1) Bulk camera→RGs map — ONE Permify scan, not N (B1)
    groupsByCam, err := s.rgSvc.GetGroupsForCamerasMap(ctx, tenantId, orgId)
    if err != nil { return nil, err }

    // 2) Per-request RG cache — populated lazily during walk (NB4: no cross-request cache in v1)
    rgCache := make(map[string]*ResourceGroup)

    out := make(map[string]IconBundle, len(cameraIDs))
    for _, camID := range cameraIDs {
        rgs := groupsByCam[camID]
        if len(rgs) == 0 { out[camID] = IconBundle{}; continue }

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

func (s *CameraService) walkChain(ctx context.Context, tenantId string, rg *ResourceGroup, state string, cache map[string]*ResourceGroup) *string {
    const MAX_DEPTH = 10
    current := rg
    for i := 0; i < MAX_DEPTH; i++ {
        if url := pickIconURL(current, state); url != nil { return url }
        if current.ParentGroupID == nil || *current.ParentGroupID == "" { return nil }
        parent, ok := cache[*current.ParentGroupID]
        if !ok {
            var err error
            parent, err = s.rgRepo.FindByIDAndOrg(ctx, *current.ParentGroupID, tenantId, orgId)
            if err != nil || parent == nil { return nil }
            cache[*current.ParentGroupID] = parent
        }
        current = parent
    }
    log.Ctx(ctx).Warn().Str("rgId", rg.GroupID).Msg("rg-tree depth exceeded")
    return nil
}
```

**Caching:** per-request map keyed by rgId, populated lazily during walk. Cross-request cache deferred to v2 (would need `rgVersion` counter on RG writes — too much overhead for v1).

**Performance target (NB3 — concrete SLO):**
- Workload: 1000 cameras × 5-deep RG tree
- Resolver budget: ≤ 50 ms p95 added to camera list endpoint
- Absolute SLO: total `/kapi/resources/camera` list endpoint p95 < 200 ms (cold) / < 100 ms (warm)

### 5.4 Icon Upload (REQUIRED under MVP-secure bundle)

**v0.2 — REQUIRED endpoint** under Q1=b + Q6=c. Admins cannot paste external URLs; they upload only.

#### `POST /kapi/resources/icons/upload`

**Auth:** Bearer + `X-Active-Org` + `organization.manage`.
**Request:** `multipart/form-data; file=<image>`

**Validation pipeline (single-pass on the multipart byte stream — no external fetch):**

1. Read up to 64 KB of multipart body (cap-bounded).
2. Magic-byte sniff first 12 bytes → derive `Content-Type` (don't trust client `Content-Type` header).
3. `Content-Length` parse → check size limit; reject as `ICON_SIZE_EXCEEDED` if exceeded.
4. `image.DecodeConfig` on the read buffer → derive width/height; check dimensions; reject as `ICON_DIMENSION_INVALID`.
5. If all pass → continue reading remainder (≤ 500 KB total) → write to `internal/infra/s3`.

**Sync mode:** admin waits ~100–300 ms (small file + local S3). Timeout: 5s upload + 2s S3 PutObject.

**Storage:** `internal/infra/s3` (existing klynx adapter — NB7). Object key: `icons/{orgId}/{sha256}.{ext}`. Public-read ACL on the icons prefix; bucket fronted by `KLYNX_ICON_CDN_HOST` (env). Object content-type matches the validated format.

**Idempotency:** re-uploading the same bytes (same sha256) returns the same URL — no duplicate objects.

**Success (`200`):** `details: { url: "https://cdn.klynx.com/icons/<orgId>/<sha256>.png" }`.

**Side effect — admin sets `icon.online` later:** Admin uploads → gets URL `U1` → PATCHes RG with `icon: { online: U1 }` → BE validates `U1` against URL allowlist (host = `KLYNX_ICON_CDN_HOST` ✓; format inferred from extension; no external fetch since BE issued the URL) → stores in Mongo.

**Storage hygiene (deferred to v2):** orphan-icon GC sweeper (icons not referenced by any RG); per-org quota.

#### URL / File Validation Rules

**Scheme allowlist:**
- Allowed: `https://`
- Rejected: `http://`, `data:`, `javascript:`, `file://`, `ftp://`, any custom scheme
- Error: 400 `INVALID_ICON_URL`, `details.allowedSchemes: ["https"]`

**Origin allowlist (Option C — self-hosted only):**
- Allowed host: `KLYNX_ICON_CDN_HOST` (env, e.g. `cdn.klynx.com`). URL must match `https://${KLYNX_ICON_CDN_HOST}/icons/...`.
- Rejected: any other host, including HTTPS-correct external CDNs.
- Error: 400 `INVALID_ICON_URL`, `details.allowedOrigins: ["cdn.klynx.com"]`, `details.url: "<got>"`.
- **Why Option C:** closes phishing-pixel + tracking attack surface entirely. Implementation: `strings.HasPrefix(url, fmt.Sprintf("https://%s/icons/", host))`. No external HEAD/GET probe needed.

**Format allowlist (content-type via magic-byte sniff):**
- Allowed: `image/png`, `image/jpeg`, `image/webp`
- Rejected: `image/svg+xml` (XSS prevention), `image/gif`, `image/bmp`, anything else
- Error: 400 `ICON_FORMAT_UNSUPPORTED`, `details.allowedFormats: [...]`, `details.got: "<actual>"`

**Size limit:**
- Default: 500 KB (524288 bytes); tunable via `KLYNX_ICON_MAX_SIZE_BYTES` (range 1024 to 10485760).
- Error: 400 `ICON_SIZE_EXCEEDED`, `details.limit: 524288`, `details.got: <actual>`.
- Enforced at upload endpoint only (PATCH/POST URL is self-issued, size already validated at upload time).

**Dimension limit:**
- Default: min 16×16 px, max 256×256 px; tunable via `KLYNX_ICON_MIN_DIM` / `KLYNX_ICON_MAX_DIM`.
- Error: 400 `ICON_DIMENSION_INVALID`, `details.minDim: 16`, `details.maxDim: 256`, `details.gotWidth: <n>`, `details.gotHeight: <n>`.

**Aspect ratio:** advisory, not enforced. Square recommended; non-square accepted but may letterbox in FE.

**`ICON_LOAD_FAILED` (v0.1 422)** — REMOVED in v0.2 since BE issues every URL under Option C; no external URL fetch on PATCH/POST. If a future version re-introduces external URLs, use 400 `ICON_LOAD_FAILED` (NB5 — 400-family for client-fixable validation).

### 5.5 Permission Profile — `includeResourceGroupChildren` (Phase C2)

#### `PATCH /kapi/orgs/resource/permissions/{profileId}` — body addition

```json
{
  "orgUnits": ["ou-uuid-1"],
  "resourceGroups": ["rg-uuid-root"],
  "includeResourceGroupChildren": true
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `includeResourceGroupChildren` | `bool` (nilable on PATCH) | no | `false` | nil = keep current; `true`/`false` = set explicitly. Same PATCH semantics as `includeOrgUnitChildren` (Phase A v4.3.0) |

#### Resolver behavior matrix (Phase C2)

| Scenario | `includeResourceGroupChildren` | profile.resourceGroupIds | Resolves cameras from |
|---|---|---|---|
| Direct rg, exact match | `false` (default) | `["rg-bangkok"]` | only cameras in `rg-bangkok` |
| Tree opt-in | `true` | `["rg-bangkok"]` | cameras in `rg-bangkok` ∪ all descendants (`rg-floor1`, `rg-floor2`, ...) |
| Mixed: opt-in + multiple roots | `true` | `["rg-bangkok", "rg-pattaya"]` | union of descendants from both |
| Existing profile, field never set | (default `false`) | (any) | preserves pre-C2 behavior exactly |

GET responses include `includeResourceGroupChildren: bool` on profile detail. Pre-C2 documents missing the field deserialize as `false`.

#### Read-side behavior

`MemberAccessService.ResolveViewableEntityIDs` returns the union of:

1. **Group-mediated (existing, with C2 expansion):** for each profile matching the user's expanded OrgUnits:
   - `IncludeResourceGroupChildren == false`: walk `profile.ResourceGroupIDs` verbatim.
   - `true`: walk `profile.ResourceGroupIDs ∪ FindDescendants(rgID) for each rgID`. Deduped before Permify lookup.
2. **Direct entity grants** (existing post Phase 2 of camera-grants): `profile.CameraIDs` if `entityType == "camera"`; `profile.KControlIDs` if `entityType == "kcontrol"`.

`FindDescendants` walk is a Mongo `Find` over `resource_groups` filtered by `(tenantId, orgId)` then in-memory BFS.

### 5.6 Round-Trip Import / Export (Phase E1-E3)

#### `GET /resources/camera/export`

**Auth:** Bearer + active org + `guardManageOrg`.

**Query:** `format` (no, default `xlsx`); `scope` (no, default `org`).

**Success (`200`):** `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; `Content-Disposition: attachment; filename="klynx-cameras-<orgSlug>-<YYYYMMDD>.xlsx"`. Body = XLSX bytes with two sheets (§5.6 Sheet Schemas).

**Errors:** 400 `INVALID_FORMAT`; 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 503 `EXPORT_TOO_LARGE` (org > 10k cameras); 500 `EXPORT_FAILED`.

#### `GET /resources/camera/template`

Same shape as export. Filename: `klynx-cameras-template-<orgSlug>-<YYYYMMDD>.xlsx`. If the active org already has cameras, the `Cameras` sheet is populated with all current camera rows including `id` + `resourceGroupIds` so operators can edit and re-import as updates. If the org has no cameras, the `Cameras` sheet has headers only; `ResourceGroups` is still populated so operators can fill new rows against real group ids.

#### `POST /resources/camera/import` (extended round-trip)

**Auth:** Bearer + active org + `guardManageOrg`.
**Content-Type:** `multipart/form-data`.

**Form fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file (`.csv` or `.xlsx`) | yes | round-trip file. UTF-8 CSV (single sheet) or XLSX (one or two sheets) |
| `allowCreateWithProvidedIds` | string `"true"` \| `"false"` | no, default `"false"` | migration mode opt-in. Honored only when env `IMPORT_ALLOW_PROVIDED_IDS_GLOBAL=true`; otherwise → `403 PROVIDED_IDS_DISABLED_BY_ENV` |

**Success (`200`):**

```json
{
  "code": "SUCCESS",
  "details": {
    "totalRows": 12,
    "inserted": 4,
    "updated": 5,
    "unchanged": 1,
    "groupsUnchanged": 0,
    "invalidRows": [],
    "duplicateIPInFile": ["10.236.4.102"],
    "duplicateIPInDB": [],
    "permifySyncFailed": [],
    "groupResults": [
      { "row": 2, "name": "Bangkok HQ", "groupId": "rg-1...", "outcome": "created" }
    ],
    "results": [
      { "row": 2, "name": "CC-066", "camId": "4b8d2a4e-...", "outcome": "updated", "success": true },
      { "row": 3, "name": "CC-099", "camId": "new-uuid-...", "outcome": "created", "success": true,
        "warnings": { "duplicateIPInFile": "10.236.4.102" } },
      { "row": 5, "name": "CC-200", "outcome": "rejected", "success": false,
        "error": "CAMERA_NOT_FOUND: id provided but camera not in this org; set allowCreateWithProvidedIds=true to create with this id" }
    ]
  }
}
```

**Field definitions:**

| Field | Type | Description |
|---|---|---|
| `details.totalRows` | int | total data rows across both sheets |
| `details.inserted` | int | camera rows inserted (`outcome=created`) |
| `details.updated` | int | camera rows updated (`outcome=updated` — at least one field or tuple set differed) |
| `details.unchanged` | int | camera rows matched by id with empty field-diff AND empty tuple-diff (`outcome=unchanged`); no Mongo write, no revision bump, no Permify churn |
| `details.groupsUnchanged` | int | group rows matched by id with empty field-diff |
| `details.invalidRows` | string[] | row numbers (per sheet, prefixed `cameras:N` or `groups:N`) that parse-failed before reaching reconcile |
| `details.duplicateIPInFile` | string[] | IPs that appeared more than once across `Cameras` sheet (warning surface only — rows still proceed) |
| `details.duplicateIPInDB` | string[] | IPs already in DB matched by **create rows** only (warning surface; not reported when an update row keeps the same IP) |
| `details.permifySyncFailed` | string[] | camIds whose Mongo write committed but Permify tuple delta failed |
| `details.groupResults[]` | object[] | per-row outcome for `ResourceGroups` sheet (omitted when sheet absent) |
| `details.results[]` | object[] | per-row outcome for `Cameras` sheet |
| `details.results[].outcome` | enum | `"created" \| "updated" \| "unchanged" \| "rejected"` |
| `details.results[].success` | bool | `true` iff Mongo write succeeded OR row was `unchanged`. Permify failure does NOT downgrade — see `permifySyncFailed[]` |
| `details.results[].warnings.duplicateIPInFile` | string | the IP that collided within the file (camera still imported) |
| `details.results[].warnings.duplicateIPInDB` | string | the IP that already exists in DB (camera still imported on a create row; not surfaced on update row that keeps existing IP) |
| `details.results[].unresolvedGroupNames` | string[] | values from legacy `groups` (name) column that could not resolve. Camera is imported without those parentGroup tuples |
| `details.results[].unresolvedGroupIds` | string[] | values from `resourceGroupIds` (id) column that did not match AND were not created by this same upload's `ResourceGroups` sheet |

**Top-level errors (HTTP != 200):**

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `NO_FILE` | no `file` field in multipart |
| 400 | `INVALID_TYPE` | extension not `.csv` / `.xlsx` |
| 400 | `PARSE_ERROR` | unreadable file |
| 400 | `MISSING_HEADER` | required header missing on `Cameras` sheet (`name`, `url`, `lat`, `long`) or `ResourceGroups` sheet (`name`) |
| 401 | `UNAUTHORIZED` | token invalid/missing |
| 403 | `FORBIDDEN` | caller lacks `organization.manage` |
| 403 | `PROVIDED_IDS_DISABLED_BY_ENV` | `allowCreateWithProvidedIds=true` sent but env flag is off |
| 409 | `IMPORT_IN_PROGRESS` | another import running for `(tenantId, orgId)`; retry after lock TTL |
| 429 | `MIGRATION_RATE_LIMIT` | migration-mode rate limit (1 per 60s per org) hit |
| 500 | `IMPORT_FAILED` | unexpected error during reconcile |

**Per-row error codes — `Cameras` sheet:**

| Code | Meaning | Consumer Handling |
|---|---|---|
| `MISSING_REQUIRED_FIELD` | row missing `name` / `url` / `lat` / `lng` | FE: highlight row |
| `INVALID_LAT_LNG` | lat/lng not parseable as float | FE: highlight row |
| `INVALID_CAM_ID` | `id` value not a UUIDv4 | FE: highlight; suggest export to repopulate |
| `CAMERA_NOT_FOUND` | `id` non-empty, not found in this org, `allowCreateWithProvidedIds=false` | FE: prompt to enable migration mode (admin) or drop the id |
| `CAMERA_ID_COLLISION_DIFFERENT_ORG` | `id` collides with a camera in a different org of the same tenant | FE: surface as data-corruption signal; escalate to ops |
| `CAMERA_GW_MANAGED` | row matches a camera with `externalSource != nil`; round-trip update forbidden | FE: indicate camera is gw-managed; edit through gw UI |
| `CAMERA_CROSS_ORG_MOVE_FORBIDDEN` | row attempts to set `orgId` to a different org than the active org | FE: show error; cross-org move not supported via import |
| `UNSUPPORTED_DEPARTMENT_FIELD` | `department` column non-empty | FE: tell user to leave empty |
| `INVALID_MAP_VISIBILITY` | non-empty value not in allowed set | FE: show allowed set |

**Per-row error codes — `ResourceGroups` sheet** (codes align with shipped hierarchy validation; **single `INVALID_PARENT` covers self-parent + cycle**, **`PARENT_NOT_FOUND` covers both "missing in this org" and "exists in a different org"** — same sentinel by design to avoid leaking cross-org existence):

| Code | Meaning | Consumer Handling |
|---|---|---|
| `MISSING_REQUIRED_FIELD` | row missing `name` | FE: highlight row |
| `INVALID_GROUP_ID` | `id` value not a UUIDv4 | FE: highlight |
| `GROUP_NOT_FOUND` | `id` non-empty, not found in this org, `allowCreateWithProvidedIds=false` | FE: prompt migration mode |
| `GROUP_ID_COLLISION_DIFFERENT_ORG` | `id` collides with group in different org | FE: data-corruption surface |
| `INVALID_PARENT` | proposed parent is self OR descendant of self (cycle). Message disambiguates: `"cannot parent group to itself"` vs `"parent would create cycle"` | FE: highlight; render message |
| `PARENT_NOT_FOUND` | `parentGroupId` / `parentGroupName` / `path` resolved a value that does not exist in this org (also covers cross-org parenting silently — same code by design) | FE: highlight; suggest creating parent first |
| `INVALID_RESOURCE_TYPE` | `resourceType` value not in `{"", "camera", "sensor"}` | FE: show allowed set |
| `INVALID_PATH_NAME_MISMATCH` | `path` cell used as parent fallback but `basename(path) != name` | FE: highlight; either fix `name` or set `parentGroupId` explicitly |
| `RESOURCE_GROUP_NAME_ALREADY_EXISTS` | name conflicts with another group in same org (per-org uniqueness, matches shipped `uq_tenant_org_groupName` index) | FE: highlight; rename either side |

#### Sheet Schemas

**`Cameras` sheet — header order (recommended):**

```
id,name,location,district,lat,lng,type,ip,user,StreamURL,brand,remark,description,resourceGroupIds,resourceGroupNames,resourceGroupPaths,groups,mapVisibility
```

(`password` is NOT exported. Empty cell on import = preserve. `status` / `department` columns omitted from export; if present on upload they are accepted-but-ignored / rejected-on-non-empty respectively.)

| Header | Internal Key | Direction | On Export | On Import |
|---|---|---|---|---|
| `id` | `id` (= `camId`) | round-trip | populated for every camera | empty → create; matches → update; non-empty + miss → see migration mode |
| `name` | `name` | round-trip | populated | required |
| `location`, `loc` | `location` | round-trip | populated | optional |
| `district` | `district` | round-trip | populated | optional |
| `lat`, `latitude` | `lat` | round-trip | populated | required |
| `lng`, `long`, `lon`, `longitude`, `longtitude` | `long` | round-trip | populated | required |
| `type`, `camtype`, `cam_type` | `type` | round-trip | populated | optional |
| `ip` | `ip` | round-trip | populated | optional; warning on duplicate |
| `user` | `user` | round-trip | populated as-is | empty cell on update = preserve |
| `password` | `password` | **export omits** | — | empty = preserve; non-empty = re-encrypt |
| `url`, `streamurl`, `stream_url` | `url` | round-trip | populated | required (or derived from `ip`) |
| `brand` | `brand` | round-trip | populated | optional |
| `remark`, `note`, `notes`, `comment` | `remark` | round-trip | populated | optional |
| `description`, `desc` | `description` | round-trip | populated | optional |
| `resourceGroupIds` | `resourceGroupIds` | round-trip primary | `;`-delimited groupIds for current Permify tuples | preferred binding; `;`-split, trim, dedupe |
| `resourceGroupNames` | `resourceGroupNames` | export-only readable | `;`-delimited names matching ids above | **ignored on import** when `resourceGroupIds` present |
| `resourceGroupPaths` | `resourceGroupPaths` | export-only readable | `;`-delimited slash-paths | **ignored on import** when `resourceGroupIds` present |
| `group`, `groups` | `groups` | legacy | not populated by export | fallback when `resourceGroupIds` empty (`,`-split, name lookup) |
| `mapvisibility`, `map_visibility`, `visibility` | `mapVisibility` | round-trip | populated | empty → default `inherit`; non-empty must be in allowed set |
| `department` | `department` | not exported | — | reject row if non-empty |
| `status` | `status` | not exported | — | accepted-at-header but ignored |

**`ResourceGroups` sheet — header order (recommended):**

```
id,name,parentGroupId,parentGroupName,path,resourceType,mapVisibility,filterVisibility,description
```

| Header | Internal Key | Direction | On Export | On Import |
|---|---|---|---|---|
| `id`, `groupid`, `resourcegroupid` | `id` (= `groupId`) | round-trip | populated for every group | empty → create; matches → update; non-empty + miss → migration mode |
| `name` | `name` | round-trip | populated | required |
| `parentGroupId`, `parentid` | `parentGroupId` | round-trip primary | populated with parent's groupId; **empty cell when group is root** | three-state semantics aligned with §5.1 PATCH:<br>• column absent from sheet → keep current parent<br>• column present + cell empty → explicit "move to root"<br>• column present + cell non-empty → set after parent-existence + cycle validation |
| `parentGroupName`, `parentname` | `parentGroupName` | export-only readable | populated when parent has a name | fallback when `parentGroupId` empty |
| `path` | `path` | round-trip | populated as the row's **own** full slash-path from root | when used as parent fallback (both `parentGroupId` + `parentGroupName` empty): parent = `dirname(path)`, and `basename(path)` MUST equal `name` else row rejected `INVALID_PATH_NAME_MISMATCH`. Single-segment path = root group |
| `resourceType` | `resourceType` | round-trip | populated | one of `""`, `"camera"`, `"sensor"`; default `""` |
| `mapVisibility` | `mapVisibility` | round-trip | populated | one of `"public"`, `"private"`; default `"private"` (does not inherit from parent — D3) |
| `filterVisibility` | `filterVisibility` | round-trip | populated | one of `"public"`, `"internal"`; default `"public"` |
| `description` | `description` | round-trip | populated | optional |

**Sheet-order rules:**
- `ResourceGroups` is processed **first** — cameras can reference groupIds the same upload just created.
- Within `ResourceGroups`, rows can reference each other's `parentGroupName` / `path` regardless of row order (parser does two passes).
- A camera row that references a group whose `ResourceGroups` row was **rejected** falls through to `unresolvedGroupIds[]` (or `unresolvedGroupNames[]`) warning — camera still imports.

### 5.7 ResourceGroup Public/Private Camera Override

This is shipped v1.1 behavior. FE must not locally mutate camera rows; the backend is authoritative.

#### Current behavior

```text
ResourceGroup.mapVisibility
  -> controls the group-level public/private action
  -> does not inherit to children
  -> overwrites camera.mapVisibility only on explicit group add/change/import flows

ResourceGroup.includeFilterChildren
  -> controls only descendant expansion when this group is selected in Live/resourceGroup filters
```

#### Shipped behavior

```text
Admin changes ResourceGroup visibility public/private
  -> cameras currently attached to that ResourceGroup receive camera.mapVisibility from the group state

Admin adds a camera to a ResourceGroup
  -> the camera receives camera.mapVisibility from that ResourceGroup's current state

Camera belongs to multiple ResourceGroups
  -> latest add/change source wins

Admin imports cameras with ResourceGroups
  -> if a row resolves one or more ResourceGroups, the camera receives the mapVisibility of the last resolved group on that row
```

#### Deferred debug fields

The shipped behavior updates `camera.mapVisibility` only. A follow-up may add debug/audit fields such as `camera.mapVisibilitySource`, `camera.mapVisibilitySourceId`, `camera.mapVisibilityUpdatedAt`, or `resourceGroup.visibilityUpdatedAt` without changing the overwrite rule above.

#### Conflict rule

Recommended rule:

```text
manual per-camera edit wins until the next explicit ResourceGroup visibility change
ResourceGroup add/change wins over older group changes
latest timestamp wins for cameras in multiple groups
```

#### Write authority warning

Camera identity and long-lived sync state are gateway-owned by default. If this overwrite updates `camera.mapVisibility`, implementation must declare whether it:

- writes through `gateway-api/device_management` first, then updates Klynx projection, or
- is intentionally Klynx projection-only and includes a repair/drift strategy.

No FE public/private overwrite UX should ship until this decision is implemented and validated.

---

## 6. Kafka / Async Event Surfaces

`N/A — not in scope.` All flows are REST. The Permify tuple writes are synchronous adapter calls, not async events.

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` No realtime push for resource-group state. Map endpoints (§5.3) poll.

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` Resolver uses per-request RG cache (RAM, lifetime = one HTTP request); cross-request cache deferred to v2 (would require `rgVersion` counter on RG writes — not shipped).

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Mongo Schema

**`resource_groups` collection** (additive on shipped pre-C1 docs):

```bson
{
  _id: ObjectId(...),
  id: "rg-uuid-1",
  tenantId: "tenant-uuid",
  orgId: "org-uuid-1",
  name: "Lobby Cameras",
  resourceType: "camera",
  parentGroupId: "rg-uuid-root",  // ← C1 (additive); legacy doc lacks this field
  // isRoot is NOT stored — DTO-derived at response time
  mapVisibility: "public",
  filterVisibility: "public",
  icon: {                         // ← icons Phase 1 (additive); legacy doc lacks this field
    online:  "https://cdn.klynx.com/icons/lobby-on.png",
    offline: null
  },
  description: "...",
  createdBy: "...",
  createdAt: ISODate(...),
  updatedAt: ISODate(...)
}
```

**Legacy doc handling:** unmarshal handles missing `parentGroupId` as `nil` → `isRoot=true`; missing `icon` as zero-value `IconBundle{}` → response normalizer coerces to `{null,null}`. No backfill required.

**Indexes:** existing `uq_tenant_org_groupName` (per-org name uniqueness); no new index — `icon` is not queried; `parentGroupId` walks are bounded depth (≤10).

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `resource_groups.id` (= `groupId`) | klynx-api `ResourceGroupRepo` (uuid) **or** caller (migration mode only) | UI / round-trip | Mongo | immutable after first write |
| `resource_groups.parentGroupId` | klynx-api `ResourceGroupRepo` | UI / round-trip | Mongo | cycle-validated on every write |
| `resource_groups.icon` | klynx-api `ResourceGroupService.Update` (PATCH) | UI / round-trip | Mongo | omit-when-omitted on POST; partial-merge on PATCH |
| `resource_groups.<other fields>` | klynx-api | UI / round-trip | Mongo | last-writer-wins |
| `resource_groups.isRoot` | — (not persisted) | response-time DTO derivation | (RAM at marshal) | `parentGroupId == null` → `true` |
| `camera.camId` | klynx-api `CameraRepo.BulkInsert` (uuid) **or** caller (migration mode only) | UI / round-trip | Mongo | immutable after first write |
| `camera.password` (encrypted) | klynx-api | round-trip / single create / gw sync | Mongo | round-trip preserves on empty cell; never returned on export |
| `camera.user` | klynx-api | round-trip / PATCH / gw sync | Mongo | empty cell on update = preserve |
| `camera.<other>` | klynx-api | round-trip / PATCH / gw sync | Mongo | revision++ on every update |
| `camera.externalSource.*` | gw sync only | gw sync only | Mongo | round-trip update path rejects with `CAMERA_GW_MANAGED` |
| `camera.icon` (response-only, derived) | — (not persisted) | resolver per request | (RAM) | resolved per §5.3 |
| Camera→Org tuple | klynx-api `CameraService.BulkCreate` | create only | Permify | written once at create; **import update path does NOT touch** |
| Camera→Creator tuple | klynx-api `CameraService.BulkCreate` | create only | Permify | written once at create |
| Camera→ParentGroup tuple | klynx-api `CameraService.ImportRoundTrip` / UI assign | round-trip / UI | Permify | delta-written on update — extra tuples deleted, missing tuples added |
| ResourceGroup→Org tuple | klynx-api `ResourceGroupService.Create` | create only | Permify | written once when group is inserted via import sheet (same path as single-create); required for resolver visibility; import update path does NOT touch |
| Icon binary objects | klynx-api `IconUploadService` | UI upload | MinIO | sha256-keyed; idempotent re-upload |

### 9.3 Tree Constraints (D1 — Cycle Prevention)

Service layer enforces on every Create + Update; failures are 400 (config error) before any Mongo write:

1. **No self-parent.** `parentGroupId != self.groupId`.
2. **No cycle.** `parentGroupId ∉ FindDescendants(self)`.
3. **Same tenant + org.** `parentGroup.tenantId == self.tenantId && parentGroup.orgId == self.orgId`. Cross-org parenting is forbidden — there is no global root.

A second guard lives in the read-side `resourceGroupExpansion` helper: a visited-set BFS so any pre-existing corrupt state (e.g. data inserted directly via Mongo bypassing the API) cannot infinite-loop the resolver. Defense in depth — a single bug in one layer cannot crash the other.

### 9.4 Permify + Visibility Interaction (B5: + mapVisibility row)

The icon resolver runs **after** Permify filters cameras visible to caller. Icons are presentation metadata layered on top of the existing visibility model.

| Caller / Endpoint | RG `filterVisibility` | RG `mapVisibility` | Icon exposed? | Rationale |
|---|---|---|---|---|
| Anonymous `GET /kapi/live/map/options` (cross-org public) | `public` | `public` or `forcePublic` | ✅ RG own icon | RG own icon is presentation metadata for the dropdown picker (no resolver, no cascade) |
| Anonymous `GET /kapi/live/map/options` | `internal` | (any) | ❌ RG excluded by `filterVisibility != "internal"` filter | `filterVisibility` now means "show in Live"; internal RGs are not in the public Live picker |
| Authenticated `GET /kapi/map/options` | `public` or `internal` | (any) | ✅ RG own icon | Authenticated pickers are permission-controlled and must not use the Live visibility flag as an authorization gate |
| Anonymous `GET /kapi/live/map` (`PublicCameraItem`) | (any) | `public` or `forcePublic` | ⚠️ v1: `{null,null}` for every item; v1.7 target | Holdback: tracking-pixel rationale needs product sign-off even though §5.4 Option C mitigates third-party risk |
| Authenticated org-member `GET /kapi/resources/camera` | `public` or `internal` | (any) | ✅ yes (within Permify scope) | Standard org view |
| Authenticated admin `GET /kapi/resources/camera` | (any) | (any) | ✅ yes (full org) | Admin sees all RGs in org |
| Authenticated `GET /kapi/map/camera` (org-owned) | `public` or `internal` | (any) | ✅ yes | Same resolver as `/kapi/resources/camera` |
| Authenticated `GET /kapi/map/camera` (cross-org public, `IsOwner=false`) | (any) | `public` or `forcePublic` | ✅ yes (v1.6, klynx-api 4.17.0) | Group-by-org bulk resolver — one Permify scan per distinct camera-source orgId |
| Authenticated `GET /kapi/live/map` (org-owned) | `public` or `internal` | (any) | ✅ yes | Auth'd path mirrors `/map/camera` |
| Authenticated `GET /kapi/live/map` (cross-org public) | (any) | `public` or `forcePublic` | ✅ yes (v1.6, 4.17.0) | Same group-by-org path |

**Why icons are exposed on `mapVisibility=public` cross-org reads (B5 decision):**
- Argument: camera is intentionally cross-org public (admin opted in via `mapVisibility=public`). Icon is presentation metadata — withholding it while showing the marker would be inconsistent.
- Tracking-pixel risk: under §5.4 Option C, every icon URL is `https://${KLYNX_ICON_CDN_HOST}/icons/...`. Anonymous cross-org public-map readers only ever fetch klynx-CDN. No third-party tracking surface.
- Load-bearing security control: §5.4 Option C (URL host = klynx CDN). If a future version re-introduces external URLs, this row needs to be revisited.

**No new Permify rules.** Feature reuses existing camera-RG visibility logic. The resolver is a pure read-time transformation on top of the Permify-filtered camera set.

### 9.5 Conflict Resolution (round-trip)

- Round-trip update path is one-way into klynx canonical stores. Bidirectional sync is out of scope.
- Permify tuple delta is computed after Mongo update commits. Partial Permify failure populates `permifySyncFailed[]` and does not roll back Mongo (consistent with create path).
- `results[].success` reflects Mongo only. Permify state must be cross-checked via `permifySyncFailed[]`.
- gw-managed camera detection is order-of-magnitude cheap (single Mongo `findOne`); the round-trip update path checks BEFORE issuing any update.
- Concurrent imports serialized per `(tenantId, orgId)` via 5-min-TTL Mongo advisory lock; second concurrent call → `409 IMPORT_IN_PROGRESS`.

---

## 10. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| RG tree picker | `GET /kapi/resources/groups` + `/{id}/descendants` | tree from flat list using `parentGroupId` + `isRoot` | follow orgUnit precedent at `internal/services/authzsvc/orgUnit.go treeNode` |
| Permission profile descendant opt-in | `PATCH /kapi/orgs/resource/permissions/{id}` | `includeResourceGroupChildren: bool` | mirrors `includeOrgUnitChildren` UI |
| RG edit panel — set icon | `POST /kapi/resources/icons/upload` → `PATCH /kapi/resources/groups/{id}` | upload returns `{url}` → patch with `icon: {online: <url>}` | use `IconBundle` type verbatim |
| Camera marker — render resolved icon | `GET /kapi/resources/camera` | `camera.icon: IconBundle` | fall back to default marker if `{null,null}` |
| Map marker — render resolved icon (4 endpoints) | `GET /kapi/map/camera`, `/cluster`, `/kapi/live/map` | same `IconBundle` | identical handling |
| Dashboard / biDash / videowall marker or list icon | camera/dashboard/videowall DTOs | BE-resolved `icon` when present | do not infer icon client-side from RG name |
| Map filter dropdown | `GET /kapi/live/map/options` | RG own `Icon` (no cascade) | flat list, render alongside RG name |
| Camera + RG export | `GET /resources/camera/export` | `format=xlsx` | trigger browser download via blob |
| Camera + RG template | `GET /resources/camera/template` | `format=xlsx` | trigger browser download via blob |
| Camera + RG import (round-trip) | `POST /resources/camera/import` | `file`, `allowCreateWithProvidedIds?` | render extended `details.results` + `details.groupResults` table |

### Frontend Type Defs

```ts
type IconBundle = {
  online: string | null
  offline: string | null
}

export type ResourceGroupResponse = {
  id: string
  name: string
  resourceType: string
  parentGroupId: string | null
  isRoot: boolean              // derived; FE reads but doesn't write
  mapVisibility: "public" | "private"
  filterVisibility: "public" | "internal"
  icon: IconBundle             // always present in response (normalized)
  // ... other existing fields ...
}

export type MenuPermissionProfileDetailResponse = {
  // ... existing fields ...
  includeResourceGroupChildren: boolean
}

export type ImportResultRow = {
  row: number
  name: string
  camId?: string
  outcome: "created" | "updated" | "unchanged" | "rejected"
  success: boolean
  error?: string
  warnings?: {
    duplicateIPInFile?: string
    duplicateIPInDB?: string
  }
  unresolvedGroupNames?: string[]
  unresolvedGroupIds?: string[]
}
```

FE tree picker pattern (from orgUnit precedent):

```ts
const nodeMap = new Map<string, TreeNode>()
groups.forEach(g => nodeMap.set(g.id, { ...g, children: [] }))
const roots: TreeNode[] = []
groups.forEach(g => {
  const node = nodeMap.get(g.id)!
  if (g.parentGroupId && nodeMap.has(g.parentGroupId)) {
    nodeMap.get(g.parentGroupId)!.children.push(node)
  } else {
    roots.push(node)
  }
})
```

### FE Guardrails

- Do NOT guess the sheet schema — pull from §5.6.
- Do NOT guess error codes — use the sets in §5.4 / §5.6.
- Do NOT remove the `id` column when re-importing an exported file — it is the round-trip key.
- Do NOT echo `password` from the export sheet (omitted by design); on update, leave the cell empty to preserve.
- Do NOT enable migration-mode checkbox by default — it must be an explicit operator opt-in per upload.
- Do NOT assume `resourceGroupNames` / `resourceGroupPaths` are usable as binding keys — they are export-only readable; binding key is `resourceGroupIds`.
- Do NOT assume `success=true` ⇒ Permify ok — always read `permifySyncFailed[]` separately.
- Do NOT implement ResourceGroup public/private overwrite in FE by locally changing camera rows. Backend §5.7 is authoritative.
- Do NOT hide internal ResourceGroups from permission-profile pickers; `filterVisibility="internal"` hides public filters/options, not admin permission targets.
- Do NOT call unknown URLs on icon upload responses — always validate against `KLYNX_ICON_CDN_HOST` before rendering.
- Localize icon errors via i18n key `toast.iconErr.<code>`; display structured `details` (e.g. "อัพโหลดไม่ได้: ขนาดเกิน 500 KB (ไฟล์: 800 KB)" — pulled from `details.limit` + `details.got`).

---

## 11. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| klynx-api | Phase C1 hierarchy | shipped 4.7.0 | `parentGroupId` write path + descendants endpoint |
| klynx-api | Phase C2 resolver | shipped 4.7.2 | `includeResourceGroupChildren` flag |
| klynx-api | Icons Phase 1+2 | shipped 4.12.0 | `icon` field + resolver + upload endpoint |
| klynx-api | Icons Phase 1.5 (map endpoints) | shipped 4.16.0 PR #147 | same `icon` field on 4 map DTOs; cross-org `{null,null}` |
| klynx-api | Icons Phase 1.6 (auth'd cross-org) | shipped 4.17.0 | group-by-org bulk resolver |
| klynx-api | Icons Phase 1.7 (anon cross-org) | pending product sign-off | tracking-pixel rationale documented; mitigation already in place |
| klynx-api | Round-trip Phase E1 | post-contract approval | reconcile + per-row outcome |
| klynx-api | Round-trip Phase E2 | after E1 deployed | IP semantic change v1→v2 |
| klynx-api | Round-trip Phase E3 | after E2 deployed | Multi-sheet support |
| klynx-feature | FE plan | after BE shipped | Separate session per phase |

---

## 12. Examples

### 12.1 Create a 3-level tree (hierarchy)

```http
POST /kapi/resources/groups
{ "name": "All Cameras" }
→ 201 { "id": "rg-root", "parentGroupId": null, "isRoot": true, "icon": {"online": null, "offline": null} }

POST /kapi/resources/groups
{ "name": "Bangkok HQ", "parentGroupId": "rg-root" }
→ 201 { "id": "rg-bangkok", "parentGroupId": "rg-root", "isRoot": false, "icon": {"online": null, "offline": null} }

POST /kapi/resources/groups
{ "name": "Floor 1", "parentGroupId": "rg-bangkok" }
→ 201 { "id": "rg-floor1", "parentGroupId": "rg-bangkok", "isRoot": false, "icon": {"online": null, "offline": null} }
```

### 12.2 Cycle attempt (rejected before write)

```http
PATCH /kapi/resources/groups/rg-root
{ "parentGroupId": "rg-floor1" }
→ 400 { "code": "INVALID_PARENT", "message": "parent would create cycle", "status": false }
```

### 12.3 Move group to root

```http
PATCH /kapi/resources/groups/rg-bangkok
{ "parentGroupId": null }
→ 200 { "id": "rg-bangkok", "parentGroupId": null, "isRoot": true }
```

`rg-floor1` stays under `rg-bangkok` — moving a parent does not detach grandchildren.

### 12.4 Set icon on root RG; cascade picks it up for descendants

Setup:
- RG-1 "All Cameras" (root, `icon: {online: "<rooturl>", offline: "<rooturl_off>"}`)
- RG-2 "Lobby" (child of RG-1, `icon: {online: null, offline: null}`)
- camera C1 in RG-2

GET `/kapi/resources/camera/C1` →

```json
{ ..., "icon": { "online": "<rooturl>", "offline": "<rooturl_off>" } }
```

### 12.5 Mid-chain icon override

Setup:
- RG-1 (root, icon for online + offline both set to "<root>")
- RG-2 (child of RG-1, `icon: {online: "<rg2_on>", offline: null}`)
- camera C2 in RG-2

GET camera C2 →

```json
{ ..., "icon": { "online": "<rg2_on>", "offline": "<root>" } }
```

### 12.6 Permission profile descendant expansion

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "orgUnits": ["ou-1"], "resourceGroups": ["rg-root"], "includeResourceGroupChildren": true }
→ 200
```

Users in `ou-1` now see cameras in `rg-root`, `rg-bangkok`, AND `rg-floor1` through this profile, even though the profile lists only `rg-root`.

### 12.7 Icon upload

```bash
curl -X POST 'https://aliza.k-lynx.com/kapi/resources/icons/upload' \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Active-Org: $ORG" \
  -F 'file=@lobby-on.png'
# → 200 { "details": { "url": "https://cdn.klynx.com/icons/<orgId>/<sha256>.png" } }

# Then PATCH the RG:
curl -X PATCH 'https://aliza.k-lynx.com/kapi/resources/groups/rg-bangkok' \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Active-Org: $ORG" \
  -d '{ "icon": { "online": "https://cdn.klynx.com/icons/<orgId>/<sha256>.png" } }'
# → 200 { ... "icon": { "online": "...", "offline": null } }
```

### 12.8 Idempotent re-import (no changes)

Operator downloads the export and immediately re-uploads without editing:

```json
{
  "details": {
    "totalRows": 1,
    "inserted": 0, "updated": 0, "unchanged": 1, "groupsUnchanged": 0,
    "results": [
      { "row": 2, "name": "CC-066", "camId": "4b8d2a4e-...", "outcome": "unchanged", "success": true }
    ]
  }
}
```

No Mongo write, no `revision++`, no Permify churn. Re-import as a "verify file is current" smoke test without side effects.

### 12.9 Migration-mode import

Operator from old klynx instance (org A) ran export; on a fresh klynx-api deploy at customer X, ops set `IMPORT_ALLOW_PROVIDED_IDS_GLOBAL=true`; operator on the new instance creates the org, then uploads the same file with `allowCreateWithProvidedIds=true`. Cameras land with their original camIds preserved; downstream consumers (event projections, delivery targets) keep working.

### 12.10 Tree round-trip

`ResourceGroups` sheet from a 3-level export:

```
id,name,parentGroupId,parentGroupName,path,resourceType,mapVisibility,filterVisibility,description
rg-root,All Cameras,,,All Cameras,,public,public,Org root
rg-bangkok,Bangkok HQ,rg-root,All Cameras,All Cameras/Bangkok HQ,camera,public,public,
rg-floor1,Floor 1,rg-bangkok,Bangkok HQ,All Cameras/Bangkok HQ/Floor 1,camera,public,public,
```

Operator adds a new row `rg-floor2` with no `id`, sets `parentGroupName=Bangkok HQ`. Re-uploads:

```json
{
  "details": {
    "groupsUnchanged": 3,
    "groupResults": [
      { "row": 2, "name": "All Cameras", "groupId": "rg-root", "outcome": "unchanged" },
      { "row": 3, "name": "Bangkok HQ", "groupId": "rg-bangkok", "outcome": "unchanged" },
      { "row": 4, "name": "Floor 1", "groupId": "rg-floor1", "outcome": "unchanged" },
      { "row": 5, "name": "Floor 2", "groupId": "<new-uuid>", "outcome": "created" }
    ]
  }
}
```

The first 3 rows match by id with zero field-diff → `outcome="unchanged"`. Re-uploading would yield `groupsUnchanged: 4`.

### 12.11 Permify-drift response

```json
{
  "details": {
    "totalRows": 2, "inserted": 0, "updated": 2,
    "permifySyncFailed": ["a1b2...", "c3d4..."],
    "results": [
      { "row": 2, "name": "CC-066", "camId": "a1b2...", "outcome": "updated", "success": true },
      { "row": 3, "name": "CC-067", "camId": "c3d4...", "outcome": "updated", "success": true }
    ]
  }
}
```

`success=true` reflects Mongo only; Permify drift surfaces via `permifySyncFailed[]`.

---

## 13. Decision Log (preserved verbatim from icons v0.2 lock)

| Decision | Picked Option | Rationale | Date |
|---|---|---|---|
| Q1 storage format | **(b) self-hosted upload only** (MVP-secure bundle) | B6: closes phishing/tracking attack surface entirely; reuses `internal/infra/s3` (NB7) | 2026-05-01 |
| Q2 inheritance | **(b) cascade up parent chain** | Intuitive admin UX: "set icon at root → all descendants inherit" | 2026-05-01 |
| Q3 resolver location | **(a) BE-resolved on camera response** | Single source of truth; FE simple; cache-friendly server-side; B1-aligned with `GetGroupsForCamerasMap` | 2026-05-01 |
| Q4 image constraints | 500 KB; PNG/JPEG/WebP; 16-256 px square recommended | tunable via env | 2026-05-01 |
| Q5 multi-resource type | **(a) camera-only MVP** | Map view is camera-centric; kcontrol/edge no map yet | 2026-05-01 |
| Q6 URL allowed schemes/origins | **(c) self-hosted only** (paired with Q1=b per MVP-secure bundle) | B6: only host = `KLYNX_ICON_CDN_HOST`, scheme = https | 2026-05-01 |
| Q7 SVG policy | **(a) reject SVG entirely** (raster only) | XSS-critical; magic-byte sniff at upload rejects `image/svg+xml` | 2026-05-01 |
| Q8 error envelope | per CLAUDE.md standard `{code, message, details, status: false}`, **all 400-family** (NB5) | matches existing klynx-api convention | 2026-05-01 |
| Q9 FE fallback | **(a) silent fallback to default + 1 console warn per unique URL** | UX: broken icons distract; warn helps debug | 2026-05-01 |
| Multi-RG-per-camera (B2) | **lex-first wins** | O(depth); deterministic; admin docs explain "set icon at canonical RG" | 2026-05-01 |
| Storage shape on POST/PATCH absent (B4) | **don't write `icon` to Mongo** when omitted | aligns with "no migration" promise | 2026-05-01 |
| Validation flow (B3) | **single partial-GET sync at upload endpoint only** | simpler than HEAD-then-GET; Q1=b makes external probe moot | 2026-05-01 |
| `mapVisibility` interaction (B5) | **icons exposed on `mapVisibility=public` cross-org reads** (Q6=c is load-bearing control) | presentation consistency; klynx-CDN-only host so no tracking-pixel risk | 2026-05-01 |

Hierarchy decisions (D1-D3) and round-trip decisions (rev 1/rev 2) are inlined under §3 / §9.

---

## 14. Out of Scope (Not in This Contract)

- Cross-org tree (groups in org A nested under groups in org B). Forbidden.
- Cascading visibility (`mapVisibility` / `filterVisibility` inheritance). Each group declares its own (D3).
- Bulk re-parent / move admin tooling. v1 ships single-PATCH only.
- Maximum depth cap. Observed via OTel; cap added later only if abuse is observed.
- Permify recursive `parentGroup.parentGroup.view` schema rules. App-level expansion only (D2).
- Camera CRUD beyond round-trip. Full camera surface lives in the future Camera Domain merge (Cluster #1).
- Anon `/kapi/live/map` cross-org icon resolution. v1.7 target — pending product sign-off.

---

## 15. Checklist

- [x] Domain / flow boundary explicit (§0 — RG entity lifecycle: tree → icons → round-trip; camera CRUD explicitly excluded; Kafka / MQTT / Redis explicitly excluded).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (resource_groups tree, icon, camera projection, Permify tuples, MinIO icon objects).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope (12+ REST surfaces).
- [x] REST request, response, and error contracts defined for all surfaces (full error matrices preserved).
- [x] Tree validation rules explicit (D1: self / cycle / cross-org).
- [x] Icon URL allowlist and validation pipeline explicit (Option C self-hosted; magic-byte sniff; size + dimension limits).
- [x] Resolver algorithm preserved verbatim (lex-first wins, parent walk, MAX_DEPTH=10, per-request cache, performance SLO).
- [x] Permify visibility matrix preserved (8 rows incl. v1.6 cross-org auth'd shipped + v1.7 anon target).
- [x] Round-trip sheet schemas preserved verbatim (Cameras + ResourceGroups headers + transform tables).
- [x] Round-trip outcome semantics preserved (created / updated / unchanged / rejected; v1→v2 IP-reject → IP-warn semantic change).
- [x] Migration mode rules preserved (double-gate env + form; UUIDv4 validation; rate limit; audit log).
- [x] Field ownership table preserved (incl. external-source readonly + Permify tuple delta rules).
- [x] Backward compatibility documented (additive C1, C2, icons; v1→v2 round-trip hard-cutover).
- [x] Replay / re-sync behavior documented (idempotent unchanged; Permify drift surface).
- [x] FE field mapping included.
- [x] Examples cover hierarchy, icons, round-trip happy path, idempotent re-import, migration mode, Permify drift.
- [x] Decision log (Q1-Q9 + B-decisions) preserved verbatim.

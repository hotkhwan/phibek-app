# Contract — ResourceGroup Hierarchy (Parent Tree)

**Plan:** [docs/plan/resourceGroup-hierarchy.md](../plan/resourceGroup-hierarchy.md)
**Owner:** klynx-api
**Status:** Superseded by [`resource-group.md`](./resource-group.md) on 2026-05-04 — RG hierarchy + RG custom icons + RG/camera round-trip merged into one ResourceGroup lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All Phase C1 + C2 behavior preserved verbatim in §5.1 + §5.5 of the merged contract: `parentGroupId` POST/PATCH semantics with three-state map-presence detection, the descendants endpoint (BFS with `includeSelf` query param), the `INVALID_PARENT` (self/cycle) and `PARENT_NOT_FOUND` (cross-org silent same-code) error codes, the response-time DTO-derived `isRoot` rule (Codex blocker fix from PR #77 — never persisted), the per-org name uniqueness rule (rejected per-parent), the Phase C2 `includeResourceGroupChildren` flag with resolver behavior matrix, and the D1-D3 decision rationale. Body kept here for PR / Codex review history.
**Versions affected:**
- Phase C1: BE accepts `parentGroupId` on `POST /resources/groups` and `PATCH /resources/groups/{id}`; new `GET /resources/groups/{id}/descendants`. New error codes `INVALID_PARENT` (self / cycle) and `404 parentGroup not found`.
- Phase C2: BE accepts `includeResourceGroupChildren` on `PATCH /orgs/resource/permissions/{id}`. Read-side resolver expands descendant rgIDs at request time when flag is true.

---

## 1. Endpoint Surface

### `POST /kapi/resources/groups`

**Auth:** Bearer JWT. Caller must have `organization.manage` permission on the active org.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `X-Active-Org: <orgId>` (required)
- `Content-Type: application/json` (required)

#### Request body (Phase C1)

```json
{
  "name": "Bangkok HQ",
  "resourceType": "camera",
  "parentGroupId": "rg-uuid-root",
  "mapVisibility": "private",
  "filterVisibility": "public"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | — | unique **per org** (matches existing `uq_tenant_org_groupName` index in [internal/repo/devicerepo/deviceGroup.go](../../internal/repo/devicerepo/deviceGroup.go)). Per-parent uniqueness was considered and explicitly rejected — keeping per-org avoids an index migration and matches current production semantics. Two siblings under different parents must still have different names. |
| `resourceType` | string | no | `""` | `"camera"` \| `"sensor"` \| `""` (= container, all types) |
| `parentGroupId` | string | no | `null` | nil = root; if set, target must exist in same `(tenantId, orgId)` |
| `mapVisibility` | string | no | `"private"` | unchanged from existing contract |
| `filterVisibility` | string | no | `"public"` | unchanged from existing Phase B-Lite contract |

**Visibility does NOT inherit from parent** (D3). Each group declares its own `mapVisibility` and `filterVisibility`. A child of an `internal` parent can be `public`, and vice versa.

#### Success response (201)

```json
{
  "code": "SUCCESS",
  "message": "resource group created",
  "status": true,
  "details": {
    "id": "rg-uuid-bangkok",
    "tenantId": "tenant-uuid",
    "orgId": "org-uuid",
    "name": "Bangkok HQ",
    "resourceType": "camera",
    "parentGroupId": "rg-uuid-root",
    "isRoot": false,
    "mapVisibility": "private",
    "filterVisibility": "public",
    "createdBy": "user-uuid",
    "createdAt": "2026-04-30T10:00:00Z",
    "updatedAt": "2026-04-30T10:00:00Z"
  }
}
```

`isRoot` is **response-time DTO-derived** (`parentGroupId == null`). It is **not persisted** in Mongo — only `parentGroupId` is stored. This avoids drift between a stored boolean and the actual parent pointer when documents are mutated by tooling outside the API (e.g. direct `mongosh` writes). Every response path (POST/PATCH/GET/list/descendants) re-computes `isRoot` at marshal time from the document's `parentGroupId`. This same rule applies to legacy documents that lack `parentGroupId` — they deserialize to `nil` → `isRoot=true` consistently.

---

### `PATCH /kapi/resources/groups/{id}`

**Auth:** same as POST.

#### Request body (Phase C1)

```json
{
  "name": "Bangkok HQ — Renamed",
  "parentGroupId": "rg-uuid-thailand"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | empty = keep existing |
| `parentGroupId` | `string \| null` | no | omit = keep current; explicit `null` = move to root; string = move under target |
| (other fields) | (existing) | no | unchanged |

**Distinguishing "omit" vs "explicit null" on PATCH:** Phase C1 uses the same `map[string]any` key-presence detection pattern as Phase 1 of camera-grants (D4 in that plan). Body is parsed once into `map[string]any`:
- key absent → keep current `parentGroupId`
- key present with `null` → move to root (`parentGroupId = nil`)
- key present with string → move under target (after validation)

This pattern is established (Phase 1 camera-grants used it for `cameras` rejection); reuse keeps the controller layer consistent.

#### Validation

Service layer rejects with `400` before any Mongo write:

| Case | HTTP | code | message |
|---|---|---|---|
| `parentGroupId` = self | 400 | `INVALID_PARENT` | `"cannot parent group to itself"` |
| `parentGroupId` ∈ self's descendants | 400 | `INVALID_PARENT` | `"parent would create cycle"` |
| `parentGroupId` not found in same `(tenantId, orgId)` | 404 | `NOT_FOUND` | `"parentGroup not found: <id>"` |

#### Success response (200)

Same shape as POST.

---

### `GET /kapi/resources/groups/{id}`

**Auth:** Bearer JWT, scoped read.

Returns the existing ResourceGroup shape extended with `parentGroupId` (string \| null) and `isRoot` (bool, DTO-derived from `parentGroupId == null` at response time — never stored in Mongo, see §1 above). Pre–C1 documents missing `parentGroupId` are returned with `parentGroupId: null` and `isRoot: true` (legacy = root) — the same response-time derivation produces the correct shape for legacy docs without any backfill.

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "id": "rg-uuid-bangkok",
    "name": "Bangkok HQ",
    "parentGroupId": "rg-uuid-root",
    "isRoot": false,
    "...": "..."
  }
}
```

---

### `GET /kapi/resources/groups/{id}/descendants` (NEW — Phase C1)

**Auth:** Bearer JWT, scoped read on the org.

**Path parameters:**
- `id` (string, required) — UUID of the root group of the subtree.

**Query parameters:**
- `includeSelf` (bool, default `false`) — when `true`, the response `items` includes the group identified by `id` as the first entry.

#### Success response (200)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "items": [
      {
        "id": "rg-uuid-bangkok",
        "name": "Bangkok HQ",
        "parentGroupId": "rg-uuid-root",
        "isRoot": false,
        "...": "..."
      },
      {
        "id": "rg-uuid-floor1",
        "name": "Floor 1",
        "parentGroupId": "rg-uuid-bangkok",
        "isRoot": false,
        "...": "..."
      }
    ]
  }
}
```

**Order:** BFS from `id` (children before grandchildren). `includeSelf=true` puts the root at index 0; subsequent items follow BFS order.

**Pagination:** none in v1. If a tenant exceeds 1000 descendants in a single subtree, the endpoint returns `200` with all items — performance fallback is to add a `limit` + cursor in a follow-up. Capture max-depth and item count via OTel metric `resourceGroup.descendants.{depth,count}`.

#### Error contract

| HTTP | code | Cause |
|---|---|---|
| 404 | `NOT_FOUND` | `id` not found in active org |

---

### `PATCH /kapi/orgs/resource/permissions/{profileId}` — flag addition (Phase C2)

Existing endpoint. New optional field on the body.

#### Body addition

```json
{
  "orgUnits": ["ou-uuid-1"],
  "resourceGroups": ["rg-uuid-root"],
  "includeResourceGroupChildren": true
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `includeResourceGroupChildren` | `bool` (nilable on PATCH) | no | `false` | nil = keep current; `true`/`false` = set explicitly. Same PATCH semantics as `includeOrgUnitChildren` (Phase A v4.3.0). |

#### Resolver behavior matrix (Phase C2)

| Scenario | `includeResourceGroupChildren` | profile.resourceGroupIds | Resolves cameras from |
|---|---|---|---|
| Direct rg, exact match | `false` (default) | `["rg-bangkok"]` | only cameras in `rg-bangkok` |
| Tree opt-in | `true` | `["rg-bangkok"]` | cameras in `rg-bangkok` ∪ all descendants (`rg-floor1`, `rg-floor2`, ...) |
| Mixed: opt-in + multiple roots | `true` | `["rg-bangkok", "rg-pattaya"]` | union of descendants from both |
| Existing profile, field never set | (default `false`) | (any) | preserves pre-C2 behavior exactly |

#### Response

GET responses include `includeResourceGroupChildren: bool` on the profile detail. Pre-C2 documents missing the field deserialize as `false`.

---

## 2. Tree Constraints (D1 — Cycle Prevention)

The service layer enforces these on every Create + Update; failures are 400 (config error) before any Mongo write:

1. **No self-parent.** `parentGroupId != self.groupId`.
2. **No cycle.** `parentGroupId ∉ FindDescendants(self)` — i.e. the proposed parent is not currently a descendant of self.
3. **Same tenant + org.** `parentGroup.tenantId == self.tenantId && parentGroup.orgId == self.orgId`. Cross-org parenting is forbidden — there is no global root.

A second guard lives in the read-side `resourceGroupExpansion` helper: a visited-set BFS so any pre-existing corrupt state (e.g. data inserted directly via Mongo bypassing the API) cannot infinite-loop the resolver. This is defense in depth — a single bug in one layer cannot crash the other.

---

## 3. Read-Side Behavior (Phase C2)

`MemberAccessService.ResolveViewableEntityIDs(ctx, tenantId, orgId, userId, entityType)` returns the union of:

1. **Group-mediated (existing, with C2 expansion):** for each profile matching the user's expanded OrgUnits:
   - if `profile.IncludeResourceGroupChildren == false`: walk `profile.ResourceGroupIDs` verbatim.
   - if `true`: walk `profile.ResourceGroupIDs ∪ FindDescendants(rgID) for each rgID`. Result rgIDs are deduped before the Permify lookup pass.
2. **Direct entity grants** (existing post Phase 2 of camera-grants, when shipped):
   - `profile.CameraIDs` if `entityType == "camera"`
   - `profile.KControlIDs` if `entityType == "kcontrol"`

The `FindDescendants` walk is a Mongo `Find` over `resource_groups` filtered by `(tenantId, orgId)` then in-memory BFS. Same shape as `OrgUnitRepo.FindDescendants` — proven at typical org scale.

---

## 4. Examples

### Example A — Create a 3-level tree

```http
POST /kapi/resources/groups
{ "name": "All Cameras" }
→ 201 { "id": "rg-root", "parentGroupId": null, "isRoot": true }

POST /kapi/resources/groups
{ "name": "Bangkok HQ", "parentGroupId": "rg-root" }
→ 201 { "id": "rg-bangkok", "parentGroupId": "rg-root", "isRoot": false }

POST /kapi/resources/groups
{ "name": "Floor 1", "parentGroupId": "rg-bangkok" }
→ 201 { "id": "rg-floor1", "parentGroupId": "rg-bangkok", "isRoot": false }
```

### Example B — Read descendants

```http
GET /kapi/resources/groups/rg-root/descendants
→ 200 {
    "details": {
      "items": [
        { "id": "rg-bangkok", "parentGroupId": "rg-root" },
        { "id": "rg-floor1", "parentGroupId": "rg-bangkok" }
      ]
    }
  }
```

### Example C — Cycle attempt

```http
PATCH /kapi/resources/groups/rg-root
{ "parentGroupId": "rg-floor1" }
→ 400 {
    "code": "INVALID_PARENT",
    "message": "parent would create cycle",
    "status": false
  }
```

No Mongo write occurred — the validation runs before persist.

### Example D — Move group to root

```http
PATCH /kapi/resources/groups/rg-bangkok
{ "parentGroupId": null }
→ 200 { "id": "rg-bangkok", "parentGroupId": null, "isRoot": true }
```

`rg-floor1` stays under `rg-bangkok` — moving a parent does not detach grandchildren.

### Example E — Permission profile with descendant expansion

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "orgUnits": ["ou-1"],
  "resourceGroups": ["rg-root"],
  "includeResourceGroupChildren": true
}
→ 200 { "details": {
    "id": "abc-123",
    "resourceGroupIds": ["rg-root"],
    "includeResourceGroupChildren": true,
    "...": "..."
  } }
```

Users in `ou-1` now see cameras in `rg-root`, `rg-bangkok`, AND `rg-floor1` through this profile, even though the profile lists only `rg-root`.

---

## 5. Error Code Summary

| HTTP | code | When |
|---|---|---|
| 400 | `INVALID_PARENT` | self-parent or cycle on PATCH |
| 400 | `BAD_REQUEST` | malformed `parentGroupId` (non-string, non-null) |
| 404 | `NOT_FOUND` | `parentGroup not found: <id>` (mismatched org or non-existent) |
| 404 | `NOT_FOUND` | `id` not found on `GET .../descendants` |

All error responses follow the standard envelope:
```json
{ "code": "...", "message": "...", "status": false }
```

---

## 6. Frontend Field Mapping (Phase C3)

| FE concept | Request body field | Response body field |
|---|---|---|
| Parent group selection | `parentGroupId` (string \| null) | `parentGroupId` (string \| null) |
| Root indicator (read-only) | — | `isRoot` (bool) |
| Profile descendant opt-in | `includeResourceGroupChildren` (bool) | `includeResourceGroupChildren` (bool) |

Frontend type def addition (klynx Phase C3):

```ts
export type ResourceGroupResponse = {
  // ... existing fields ...
  parentGroupId: string | null   // NEW (C1)
  isRoot: boolean                // NEW (C1, derived)
}

export type MenuPermissionProfileDetailResponse = {
  // ... existing fields ...
  includeResourceGroupChildren: boolean   // NEW (C2)
}
```

FE tree picker pattern (from orgUnit precedent at `internal/services/authzsvc/orgUnit.go treeNode`):

```ts
// Build tree from flat list
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

---

## 7. Backwards Compatibility

- Pre-C1 ResourceGroup documents have no `parentGroupId` field → deserialize to `null`, `isRoot` derives to `true`. They behave exactly as today (flat root groups).
- Pre-C2 PermissionProfile documents have no `includeResourceGroupChildren` field → deserialize to `false`, resolver behaves exactly as today.
- Existing FE code that does not send `parentGroupId` continues to create root-level groups — same as today's flat model.
- No Mongo migration. No backfill. No Permify schema diff.

---

## 8. Out of Scope (Not in This Contract)

- Cross-org tree (groups in org A nested under groups in org B). Forbidden.
- Cascading visibility (`mapVisibility` / `filterVisibility` inheritance). Each group declares its own (D3).
- Bulk re-parent / move admin tooling. v1 ships single-PATCH only.
- Maximum depth cap. Observed via OTel; cap added later only if abuse is observed.
- Permify recursive `parentGroup.parentGroup.view` schema rules. App-level expansion only (D2).

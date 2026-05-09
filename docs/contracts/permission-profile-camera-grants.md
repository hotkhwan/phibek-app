# Contract — Permission Profile Camera Grants

**Plan:** [docs/plan/permission-profile-camera-grants.md](../plan/permission-profile-camera-grants.md)
**Owner:** klynx-api
**Status:** Superseded by [`permission-profile.md`](./permission-profile.md) on 2026-05-04 — camera-grants + member-scope + edge-grant merged into one Permission Profile lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All Phase 1 (forward guard `CAMERA_DIRECT_GRANTS_UNSUPPORTED`) + Phase 2 (typed `cameras` field + Permify Cartesian-product tuple writes + `directGrantsByEntityType` resolver dispatch) + Phase A (`includeOrgUnitChildren`) + Phase B-Lite/B-Wire (`filterVisibility`) + status nil-keep fix (4.7.3) preserved verbatim in §5.1 / §9.1-9.2 / §10 of the merged contract. Body kept here for PR / Codex review history.
**Versions affected:**
- Phase 1 (FE re-frame + small BE forward guard): one new error code on `POST` and `PATCH` — `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` when the request body contains the JSON key `cameras` or `cameraIds`. No new accepted fields. Closes the silent-ignore footgun that hid the broken path in `a932740e`.
- Phase 2: backend contract update — `cameras` field added to update body (the `cameras` rejection from Phase 1 is lifted); `cameraIds` returned in get/list responses (the response-only `cameraIds` rejection on requests stays in place).

---

## 1. Endpoint Surface

### `PATCH /kapi/orgs/resource/permissions/{profileId}`

**Auth:** Bearer JWT. Caller must have `organization.manage` permission on the active org (header `X-Active-Org`).

**Path parameters:**
- `profileId` (string, required) — UUID of the resource permission profile.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `X-Active-Org: <orgId>` (required)
- `Content-Type: application/json` (required)

#### Request body (Phase 2)

```json
{
  "name": "Operations team — Cameras + KControls",
  "description": "View access for Ops shift",
  "status": true,
  "relations": ["viewer"],
  "orgUnits":       ["ou-uuid-1", "ou-uuid-2"],
  "resourceGroups": ["rg-uuid-1"],
  "kControls":      ["kctrl-device-id-1"],
  "cameras":        ["cam-uuid-1", "cam-uuid-2"]
}
```

**Field semantics for resource-binding arrays (`orgUnits`, `resourceGroups`, `kControls`, `cameras`):**

| Value sent | Backend behaviour |
|---|---|
| field absent (`nil`) | keep current value |
| `[]` (explicit empty array) | clear all bindings of that type, delete corresponding Permify tuples |
| `["id1", "id2", ...]` | replace bindings; validate each id; delete old tuples; write new tuples |

This is the same semantics already in place for `kControls` in Phase 0.

**Field semantics for non-binding fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no on PATCH | empty string treated as "keep old" |
| `description` | string | no | empty string treated as "keep old" |
| `status` | bool | no | when `false`, no Permify tuples are written even if bindings are non-empty |
| `relations` | string[] | no | nil = keep old; `[]` = reset to `["viewer"]`; `["viewer","editor","deleter","creator"]` allowed values |

**`creator` relation handling for cameras (per Decision D1/D1a in plan):** if `relations` includes `creator` and `cameras` is non-empty, the camera tuple writer skips the `creator` relation silently and proceeds with the other relations. The Permify schema for the camera entity does not expose `creator @orgUnit`. KControl behaviour is unchanged — its schema includes `creator @orgUnit`.

#### Phase 1 forward-defensive rejection — `cameras` / `cameraIds` request keys

Until Phase 2 ships the canonical `cameras []string` request field, both `Create` (`POST /orgs/resource/permissions`) and `Update` (`PATCH /orgs/resource/permissions/{id}`) **reject** any payload that contains the JSON key `cameras` or `cameraIds` with `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED`.

| Phase | `cameras` key on request | `cameraIds` key on request |
|---|---|---|
| **Phase 1** | rejected `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` | rejected `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` |
| **Phase 2** | accepted (typed `cameras []string` field) | rejected `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` (response-only field name) |

The trigger is **presence of the JSON key**, not non-emptiness. `{"cameras": []}`, `{"cameras": null}`, and `{"cameras": ["cam-1"]}` all return 400. FE must omit the key entirely until Phase 2 ships.

**Why a guard rather than silent-ignore:** Go's struct binding silently drops unknown JSON keys (`c.Bind().Body(&body)` with no `cameras` field on the struct → key is dropped, request returns 200). That was the original `a932740e` debugging footgun where FE thought it had written camera grants. Phase 1 makes the rejection explicit so future / cross-team contributors get a loud failure, not a silent miss.

#### Success response (200)

```json
{
  "code": "SUCCESS",
  "message": "permission profile updated",
  "status": true,
  "details": {
    "id": "profile-uuid",
    "orgId": "org-uuid",
    "name": "Operations team — Cameras + KControls",
    "description": "View access for Ops shift",
    "status": true,
    "relations": ["viewer"],
    "orgUnitIds":       ["ou-uuid-1", "ou-uuid-2"],
    "resourceGroupIds": ["rg-uuid-1"],
    "kcontrolIds":      ["kctrl-device-id-1"],
    "cameraIds":        ["cam-uuid-1", "cam-uuid-2"],
    "createdBy": "user-uuid",
    "createdAt": "2026-04-30T08:30:00Z",
    "updatedAt": "2026-04-30T10:15:42Z"
  }
}
```

Note: response field is `cameraIds` (plural, with `Ids` suffix) to match existing convention (`orgUnitIds`, `resourceGroupIds`, `kcontrolIds`). Request field is `cameras` to match existing convention (`orgUnits`, `resourceGroups`, `kControls`).

#### Error contract

| HTTP | code | message format | Cause |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `"invalid body"` | malformed JSON or wrong types |
| 400 | `BAD_REQUEST` | `"invalid relation '<r>', must be creator\|viewer\|editor\|deleter"` | unknown relation in `relations` |
| 400 | `CAMERA_DIRECT_GRANTS_UNSUPPORTED` | `"direct per-camera grants are not supported in Phase 1; compose grants via resourceGroup containing the target cameras"` | **new in Phase 1** — request body contains the JSON key `cameras` or `cameraIds` (any value, including `null`, `[]`, or non-empty list). Phase 2 lifts the `cameras` rejection in the same PR that adds the typed `cameras` field. |
| 403 | `FORBIDDEN` | `"forbidden"` | caller lacks `organization.manage` |
| 404 | `NOT_FOUND` | `"not found: orgUnit not found: <id>"` | unknown OU id |
| 404 | `NOT_FOUND` | `"not found: resourceGroup not found: <id>"` | unknown RG id |
| 404 | `NOT_FOUND` | `"not found: kcontrol device not found: <id>"` | unknown kcontrol id |
| 404 | `NOT_FOUND` | `"not found: camera not found: <id>"` | **new in Phase 2** — camera id not in active org |
| 500 | `INTERNAL` | `"permify sync (cameras) failed: <detail>"` | Mongo persisted but Permify write failed; admin should retry |
| 500 | `INTERNAL` | `"permify sync (kcontrols) failed: <detail>"` | (existing) |
| 500 | `INTERNAL` | `"permify sync (resourceGroups) failed: <detail>"` | (existing) |

Mongo state may be ahead of Permify after a 500. Retry the PATCH with the same body to reconcile.

---

### `GET /kapi/orgs/resource/permissions/{profileId}`

**Auth:** Bearer JWT, scoped read on the org.

#### Success response (200) — Phase 2

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "id": "profile-uuid",
    "orgId": "org-uuid",
    "name": "...",
    "description": "...",
    "status": true,
    "relations": ["viewer"],
    "orgUnitIds":       ["ou-uuid-1"],
    "resourceGroupIds": ["rg-uuid-1"],
    "kcontrolIds":      [],
    "cameraIds":        ["cam-uuid-1"],
    "createdBy": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Pre-Phase-2 documents that don't have `cameraIds` in Mongo are returned with `"cameraIds": []` (empty array, not omitted).

---

### `GET /kapi/orgs/resource/permissions`

List endpoint. Each item in `details.items[]` follows the same shape as the GET-by-id `details` (i.e. includes `cameraIds` after Phase 2).

---

### `POST /kapi/orgs/resource/permissions`

**No change.** Profile creation does not accept resource bindings; admins must PATCH after creation. This mirrors the current behaviour for `resourceGroups` and `kControls`.

---

## 2. Permify Schema Change (Phase 2)

### Current `entity camera`

```perm
entity camera {
    relation parentOrg    @organization
    relation parentGroup  @resourceGroup
    relation liveOperator @orgUnit
    relation ptzOperator  @orgUnit
    relation creator      @user

    permission view   = parentGroup.view or parentOrg.manage
    permission edit   = parentGroup.edit or parentOrg.manage
    permission delete = parentGroup.delete or parentOrg.manage
    permission live   = liveOperator.view or parentOrg.manage
    permission ptz    = ptzOperator.view or parentOrg.manage
}
```

### Proposed `entity camera` (additive)

```perm
entity camera {
    relation parentOrg    @organization
    relation parentGroup  @resourceGroup
    relation liveOperator @orgUnit
    relation ptzOperator  @orgUnit
    relation creator      @user
    relation viewer       @orgUnit   // NEW
    relation editor       @orgUnit   // NEW
    relation deleter      @orgUnit   // NEW

    permission view   = viewer.view  or parentGroup.view   or parentOrg.manage
    permission edit   = editor.manage or parentGroup.edit  or parentOrg.manage
    permission delete = deleter.manage or parentGroup.delete or parentOrg.manage
    permission live   = liveOperator.view or parentOrg.manage
    permission ptz    = ptzOperator.view or parentOrg.manage
}
```

**Additive guarantees:**
- No relation removed or renamed.
- No permission removed. Each existing permission rule is extended with `or <new>` clauses, so any subject that had access before still has access.
- `creator @user` is preserved unchanged (per Decision D1).

---

## 3. Tuple Shape (Phase 2)

When a profile is saved with `cameras: [camId1, camId2]`, `orgUnits: [ouId1, ouId2]`, `relations: [viewer, editor]`:

```
(camera:camId1, viewer,  orgUnit:ouId1)
(camera:camId1, viewer,  orgUnit:ouId2)
(camera:camId1, editor,  orgUnit:ouId1)
(camera:camId1, editor,  orgUnit:ouId2)
(camera:camId2, viewer,  orgUnit:ouId1)
... (full Cartesian)
```

Same Cartesian-product pattern as `writeKControlTuples`. Tuples for `creator` are skipped per D1a.

On profile PATCH, all old `(camera:*, *, orgUnit:*)` tuples derived from the previous state are deleted before the new set is written. Tuples derived from `parentGroup` (i.e. cameras assigned to a ResourceGroup independently) are **not touched**.

---

## 4. Read-side Behaviour (Phase 2)

`MemberAccessService.ResolveViewableEntityIDs(ctx, tenantId, orgId, userId, entityType)` returns the union of:

1. **Group-mediated** (existing): for each profile matching the user's expanded OrgUnits, walk `profile.ResourceGroupIDs`, then list Permify tuples with subject `resourceGroup:rgID`, filter by `entityType` and `relation == "parentGroup"`.
2. **Direct entity grants** (new): for each profile matching the user's expanded OrgUnits, additionally collect:
   - `profile.CameraIDs` if `entityType == "camera"`
   - `profile.KControlIDs` if `entityType == "kcontrol"`

The result is the deduplicated union of both sets. Existing callers (camera/kcontrol/edge `List` endpoints) get the union transparently.

**Regression protection:** the kcontrol direct-grants path is exercised by the same code change. A profile with only `kcontrolIds` set (no resourceGroups, no cameras) must resolve correctly through the new branch. This closes the latent inconsistency described in plan §3.

---

## 5. Examples

### Example A — Phase 1 happy path (FE re-frame, ResourceGroup-only)

User flow: admin opens advanced slideover → sees "ResourceGroup" (and "KControl"); selects a group; saves. FE PATCHes:

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "resourceGroups": ["rg-uuid-1"],
  "status": true
}
```

Behaviour identical to today (no `cameras` / `cameraIds` keys in body → guard passes through to existing handler).

### Example A2 — Phase 1 forward guard fires (was previously a silent 200)

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "resourceGroups": ["rg-uuid-1"],
  "cameras": ["cam-001"]
}
```

Response (Phase 1):

```json
{
  "code": "CAMERA_DIRECT_GRANTS_UNSUPPORTED",
  "message": "direct per-camera grants are not supported in Phase 1; compose grants via resourceGroup containing the target cameras",
  "status": false
}
```

HTTP `400`. No Mongo write, no Permify write. FE should:
1. Surface a clear error pointing user to the resourceGroup picker, OR
2. Drop the `cameras` key entirely from its payload composer until Phase 2 ships.

Pre-Phase-1, this same payload would have returned `200` with `resourceGroups` written and `cameras` silently dropped — the debugging footgun.

### Example A3 — Empty `cameras: []` is also rejected

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "cameras": [] }
```

Response (Phase 1): `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED`. Presence of the key is the trigger, not non-emptiness — keeps the FE contract simple ("don't send the key in Phase 1, period").

### Example B — Phase 2 add a single camera

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "cameras": ["cam-001"],
  "status": true
}
```

Response:

```json
{
  "code": "SUCCESS",
  "status": true,
  "details": {
    "id": "abc-123",
    "cameraIds": ["cam-001"],
    "kcontrolIds": [],
    "resourceGroupIds": ["rg-uuid-1"],
    "orgUnitIds": ["ou-1"],
    "relations": ["viewer"],
    ...
  }
}
```

Note: `resourceGroupIds` and `orgUnitIds` are preserved because their fields were absent (`nil` semantics).

### Example C — Phase 2 clear cameras

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "cameras": []
}
```

All `(camera:*, *, orgUnit:*)` tuples for this profile are deleted. Mongo `cameraIds` becomes `[]`. Other bindings untouched.

### Example D — Phase 2 unknown camera

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "cameras": ["does-not-exist"] }
```

Response:

```json
{
  "code": "NOT_FOUND",
  "message": "not found: camera not found: does-not-exist",
  "status": false
}
```

No Mongo write occurred. Profile state is unchanged.

### Example E — Phase 2 mixed update

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "cameras":   ["cam-001", "cam-002"],
  "kControls": ["kctrl-001"],
  "orgUnits":  ["ou-1", "ou-2"]
}
```

Atomic-ish: validate all → delete all old derived tuples → persist Mongo → write all new tuples. If Permify write fails halfway through, returns 500 with `permify sync (cameras) failed` or `permify sync (kcontrols) failed` etc.; Mongo state is the new state.

---

## 6. Frontend Field Mapping (Phase 2)

| FE concept | Request body field | Response body field |
|---|---|---|
| OrgUnit selection | `orgUnits` | `orgUnitIds` |
| ResourceGroup selection | `resourceGroups` | `resourceGroupIds` |
| KControl device selection | `kControls` | `kcontrolIds` |
| Camera device selection (NEW) | `cameras` | `cameraIds` |

Frontend type def addition:

```ts
export type MenuPermissionProfileDetailResponse = {
  // ... existing fields ...
  orgUnitIds: string[]
  menuIds: string[]
  resourceGroupIds: string[]
  kcontrolIds: string[]
  cameraIds: string[]            // NEW
  relations: string[]
  // ...
}
```

`applyAdvanced()` switch:

```ts
const payloadKeyByType: Record<string, 'kControls' | 'cameras' | 'resourceGroups'> = {
  kcontrol:      'kControls',
  camera:        'cameras',
  resourceGroup: 'resourceGroups',
}
const key = payloadKeyByType[advancedSelectedType.value]
await updateProfile({ [key]: advancedSelectedItems.value.map(d => d.deviceId ?? d.id) })
```

---

## 7. OrgUnit Child Expansion — `includeOrgUnitChildren` (Phase A, v4.3.0)

Companion plan: [docs/plan/permission-profile-orgunit-and-rg-filter-visibility.md](../plan/permission-profile-orgunit-and-rg-filter-visibility.md).

### Purpose

By default, a permission profile bound to an orgUnit (e.g. `อำเภอเมือง`) applies only to users whose direct orgUnit (or its descendants in the user-side BFS) intersects the profile's `orgUnitIDs`. Users in the **descendants** of the profile's bound orgUnit (e.g. `ตำบลรอง`, `หมู่บ้าน...`) do NOT inherit access automatically.

`includeOrgUnitChildren` is an opt-in flag on the profile that flips this default for the bound profile only — when `true`, the resolver expands the profile's `orgUnitIDs` to include all descendants at request time, so the profile applies to users in those descendants too.

### Request body addition (PATCH `/orgs/resource/permissions/{id}`)

```json
{
  "orgUnits": ["ou-amphoe-mueang"],
  "includeOrgUnitChildren": true,
  "resourceGroups": ["rg-traffic"],
  "relations": ["viewer"]
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `includeOrgUnitChildren` | `bool` (nilable in PATCH semantics) | no | `false` | nil = keep current; `true`/`false` = set explicitly |

### Resolver behavior matrix

| Scenario | `includeOrgUnitChildren` | User's orgUnit | profile.orgUnitIDs | Match? |
|---|---|---|---|---|
| Direct user in bound OU | `false` (default) | อำเภอเมือง | `["อำเภอเมือง"]` | ✅ |
| User in descendant of bound OU | `false` (default) | ตำบลรอง | `["อำเภอเมือง"]` | ❌ — default isolates levels |
| User in descendant of bound OU | `true` (opt-in) | ตำบลรอง | `["อำเภอเมือง"]` | ✅ — descendant expansion catches it |
| Direct user in bound OU | `true` (opt-in) | อำเภอเมือง | `["อำเภอเมือง"]` | ✅ |
| User in unrelated OU | (any) | อำเภอข้างเคียง | `["อำเภอเมือง"]` | ❌ |
| Existing profile, field never set | (default `false`) | (any) | (any) | preserves pre-v4.3.0 behavior exactly |

### Response field

GET responses include `includeOrgUnitChildren: bool` on the profile detail. Pre-v4.3.0 documents missing the field deserialize as `false` (Go zero value).

### Implementation note (BE-internal, FE doesn't need to know)

Read-side only: the resolver's flag-true expansion path (`MemberAccessService.ResolveViewableEntityIDs` step 3') walks `orgUnitRepo.FindDescendants` per flag-true profile. Permify tuples are NOT denormalized for descendants — source of truth stays the orgUnit tree at request time.

### FE guidance

- Render an opt-in checkbox **"รวมหน่วยงานย่อย"** beside the orgUnit picker on the permission-profile editor. Default unchecked.
- Suggested chip representation: `อำเภอเมือง + หน่วยงานย่อย` when checked.
- No migration required — existing profiles continue to behave as `false` until admin explicitly opts in.

---

## 8. ResourceGroup `filterVisibility` (Phase B-Lite, v4.3.0)

### Scope

Adds a Mongo model field + DTO accept on `POST /resources/groups` (Create) and `PATCH /resources/groups/{id}` (Update). **The field is persisted but has no read-time filter behavior wired yet** — that is "B-Wire," tracked as a separate follow-up. Phase B-Lite gets the contract published so FE / admins can start tagging resourceGroups correctly today; B-Wire applies the filter on Map / dashboard / report listings later.

### Field

| Field | Type | Default | Values | Notes |
|---|---|---|---|---|
| `filterVisibility` | `string` | `"public"` | `"public"` \| `"internal"` | Empty/missing in legacy docs is normalized to `"public"` at service Insert; PATCH treats `""` as "keep existing." Anything else → `400 BAD_REQUEST "filterVisibility must be public or internal"`. |

### Distinction from existing `mapVisibility`

| Field | Scope | Values | What it controls |
|---|---|---|---|
| `mapVisibility` (existing) | **cross-org** | `public` \| `private` \| `forcePublic` (cameras) | Whether a resourceGroup or camera is visible to anonymous / cross-org map viewers (existing behavior, unchanged) |
| `filterVisibility` (new in v4.3.0) | **within-org** | `public` \| `internal` | Whether the resourceGroup will appear in user-facing pickers / filter dropdowns once B-Wire ships. Permission resolver does NOT consult this field — `filterVisibility="internal"` rgs remain valid grant targets. |

The two fields are **independent** — both can be set in any combination. A resourceGroup with `mapVisibility="public" filterVisibility="internal"` is valid (cross-org viewable, but not in pickers).

### Request body — `POST /resources/groups`

```json
{
  "name": "Internal Pilot Cameras",
  "resourceType": "camera",
  "mapVisibility": "private",
  "filterVisibility": "internal"
}
```

### Request body — `PATCH /resources/groups/{id}`

```json
{
  "name": "Internal Pilot Cameras",
  "filterVisibility": "internal"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `filterVisibility` | string | no | `""` or omitted = keep current; `"public"` / `"internal"` = set; anything else = 400 |

### Response

GET returns `filterVisibility: "public" \| "internal"`. Legacy docs without the field serialize via `omitempty` and are treated as `"public"` by the service layer when read.

### Phase B-Wire — ✅ Shipped v4.5.0

Within-org picker filter wiring shipped. Two repo helpers carry the
`$ne: "internal"` clause:

- `ResourceGroupRepo.ListGroupOptions(ctx, resourceType)` — used by the
  anonymous `/live/map/options` endpoint and `analyticsvc.overview` analytics
  picker.
- `ResourceGroupRepo.ListGroupOptionsByOrg(ctx, tenantId, orgId, resourceType)` —
  used by the auth'd `/map/options` endpoint and any auth'd dashboard / report
  picker that filters by active org.

Both filters are built by pure helpers `buildGroupOptionsFilter` /
`buildGroupOptionsByOrgFilter` for unit-test isolation; see
`internal/repo/devicerepo/deviceGroup_b_wire_test.go` (10 cases).

#### Endpoint coverage matrix

| Endpoint | Behavior post-4.5.0 |
|---|---|
| `/live/map/options` (anon, cross-org public map) | excludes `internal` rgs |
| `/map/options` (auth, scoped to active org) | excludes `internal` rgs |
| `analyticsvc.overview` (analytics dashboard picker) | excludes `internal` rgs |
| `GET /resources/groups` (admin management page) | **unchanged** — admins still see/edit internal rgs (uses `repo.List`, not the picker helpers) |
| `GetGroupsForCamera` (camera detail metadata "this camera belongs to") | **unchanged** — informational, not a picker |
| Permission profile resolver | **unchanged** — `internal` rgs remain valid permission targets |

#### Legacy doc behavior

Mongo `$ne: "internal"` matches:
- absent field (legacy docs created before v4.3.0 — no `filterVisibility` key) ✅ pass
- empty string `""` ✅ pass
- `"public"` ✅ pass
- any other future enum value ✅ pass
- only `"internal"` is excluded

This aligns with the "missing → public" normalization documented in §8 and
preserved by Codex review note 1 on PR #68.

### FE guidance (post-4.5.0)

- The Phase B-Lite "still appears in pickers temporarily" banner can be removed
  — internal rgs are now hidden from user-facing pickers.
- No FE-side filter wiring required — backend filters server-side.
- Admin management page (where admins create/edit rgs) still shows all rgs
  including internal — no FE change needed there.
- No migration required for existing rgs.

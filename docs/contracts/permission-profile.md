# Permission Profile Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `permission-profile-camera-grants.md` + `permission-profile-member-scope.md` + `permission-edge-resource-grant.md`)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/done/permission-profile-camera-grants.md](../plan/done/permission-profile-camera-grants.md), [docs/plan/done/permission-profile-camera-grants-phase2.md](../plan/done/permission-profile-camera-grants-phase2.md), [docs/plan/done/permission-profile-orgunit-and-rg-filter-visibility.md](../plan/done/permission-profile-orgunit-and-rg-filter-visibility.md), [docs/plan/done/permission-profile-member-scope.md](../plan/done/permission-profile-member-scope.md), [docs/plan/done/permission-edge-resource-grant.md](../plan/done/permission-edge-resource-grant.md), [docs/plan/resource-permission-menu-scope-alignment.md](../plan/resource-permission-menu-scope-alignment.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST + Sync`
**Version:** `v1` — combined: Phase 1 forward guard shipped 4.2.2; Phase 2a camera direct grants shipped 4.6.0; Phase 2b resolver visibility shipped 4.7.1 (PR #81); Phase A `includeOrgUnitChildren` shipped 4.3.0; member-scope shipped 4.14.0 (PR #140); status nil-keep fix shipped 4.7.3 (PR #84); edge resource grant shipped 4.19.0 (PR #155)
**Supersedes:** `permission-profile-camera-grants.md` (Phase 1 + 2 + Phase A includeOrgUnitChildren + Phase B-Lite/B-Wire filterVisibility), `permission-profile-member-scope.md` (memberIds + stream-endpoint resolver gate), `permission-edge-resource-grant.md` (edgeIds + edge picker + /system/edge filter behavior change)

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `permission-profile` |
| Flow name | Resource Permission Profile lifecycle: orgUnit binding → resource bindings (cameras / kcontrols / edges / resourceGroups) → member narrowing → resolver visibility |
| Lifecycle scope | admin PATCH `/orgs/resource/permissions/{id}` with one or more binding fields → service validates each id → Mongo `$set` → Permify tuple delta (camera direct grants only) → resolver consumes profile fields at request time → list/stream endpoints filter by resolver result |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `PATCH /kapi/orgs/resource/permissions/{profileId}` | full body schema — orgUnits, resourceGroups, kControls, cameras, edges, memberIds, includeOrgUnitChildren, status |
| REST | `GET /kapi/orgs/resource/permissions[/{profileId}]` | list / detail with all binding response fields |
| REST | `POST /kapi/orgs/resource/permissions` | profile creation — no resource bindings accepted; admins must PATCH after |
| REST | `GET /api/v3/resources/edge` | edge picker for the Resource Permission slideover (mirrors `/resources/camera`, `/resources/kcontrol`) |
| REST | `GET /media/stream/{camId}` | authenticated stream endpoint — enforces resolver gate (Codex rev 1 from member-scope) |
| REST | `GET /api/v3/system/edge` | edge filter behavior changes for non-admin callers (shipped 4.19.0) |
| REST | effectiveAccess (`GET /me/effectiveAccess` or current org effectiveAccess route) | resource-derived menu visibility for `systemDevices` children |
| Sync | Permify camera entity additive schema (viewer/editor/deleter @orgUnit) | Phase 2 of camera-grants; tuples written via Cartesian-product pattern |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| `dashboard-camera-scope-filter.md` (`GET /analytics/live/overview`) | different endpoint, different feature (analytics scope filter, not permission profile) | sibling contract — kept standalone in audit |
| ResourceGroup CRUD + tree (Phase C1+C2) | covered by `resource-group.md` (Cluster #5 merge) | sibling contract |
| ResourceGroup `filterVisibility` (Phase B-Lite + B-Wire v4.5.0) | covered by `resource-group.md` §3 + §9.4 | sibling contract — referenced from §10 |
| ResourceGroup `includeResourceGroupChildren` (Phase C2 v4.7.2) | covered by `resource-group.md` §5.5 | sibling contract |
| Camera identity / sync state | covered by future Camera Domain merge (Cluster #1) | sibling contract |
| Snapshot endpoints, recording playback, kcontrol `/operate` paths | not yet audited for the same resolver-bypass pattern | follow-up audit task per member-scope §14 |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`resource-group.md`](./resource-group.md) | sibling — `includeResourceGroupChildren` + `filterVisibility` rules live there; this contract's §10 references them but does not duplicate |
| Future `device-camera-domain.md` (Cluster #1 merge) | sibling — camera CRUD lives there; this contract's §5.5 stream-endpoint enforcement is the resolver-side gate that the camera surface must respect |
| `dashboard-camera-scope-filter.md` | unrelated — `GET /analytics/live/overview` scope param is independent of permission profile |

### Grouping Rationale

All three source contracts extend the **same** `PATCH /kapi/orgs/resource/permissions/{profileId}` endpoint with **different binding types** that share identical schema patterns:

- camera-grants adds `cameras` (Phase 2 typed field with Permify tuple writes)
- member-scope adds `memberIds` (read-time-only narrowing filter — no tuples)
- edge-grant adds `edges` (read-time-only direct grants — no tuples; mirrors memberIds pattern)

All share the same auth, the same nil-keep PATCH semantics, the same error envelope, the same `directGrantsByEntityType` resolver dispatch (post v4.7.1), and the same FE pattern (`<entity>` request key ↔ `<entity>Ids` response key with response-only-key reject guard). A reader of any one source contract alone cannot understand the full PATCH body schema. Per `docs/contracts/README.md` grouping rule, these are one flow → one contract.

---

## 1. Purpose

Defines the full lifecycle of `permission_profiles` — the central authorization primitive that links **orgUnits** (who) to **resources** (what) with **relations** (how):

- **Resource binding fields:** `orgUnits`, `resourceGroups`, `kControls`, `cameras`, `edges`. Each follows the same nil-keep / explicit-clear / explicit-replace semantics. `cameras` is the only one that writes Permify tuples (Phase 2 Cartesian-product); the others are read-time-only via the resolver.
- **Member narrowing field:** `memberIds` — optional per-user filter on top of OU intersection (`memberIds=[]` = applies to all matched OU members; non-empty = narrow to listed users).
- **OU expansion flag:** `includeOrgUnitChildren` (Phase A) — opt-in, walks orgUnit descendants at request time.
- **Phase 1 forward guard:** explicit `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` rejection when the request body contains `cameras` or `cameraIds` (closes the silent-ignore footgun from `a932740e`). Phase 2 lifts the `cameras` rejection; the `cameraIds` (response-only) rejection stays.
- **Stream endpoint resolver gate:** `GET /media/stream/{camId}` enforces the resolver result for non-admin callers (Codex rev 1 from member-scope — closes the permissive bypass that allowed any authenticated user to stream any own-org camera regardless of profile narrowing).

`klynx-api` publishes this as source of truth; `klynx-feature` must implement against it and must not infer the request/response asymmetry, error codes, validation order, or resolver semantics from code or screenshots.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Permission profile | `klynx-api` | `permission_profiles` (MongoDB) | per-org scoped via `orgId` field |
| Profile → OU / RG / kcontrol / camera / edge bindings | `klynx-api` | `permission_profiles.{orgUnitIds, resourceGroupIds, kcontrolIds, cameraIds, edgeIds, memberIds}` | last-writer-wins on PATCH |
| KControl permission identity | `klynx-api` | `kcontrol.deviceId` after approve | MQTT auto-register creates `hwId` first; permission starts only after approve assigns `tenantId`, `orgId`, and `deviceId` |
| Camera→`viewer`/`editor`/`deleter`→OU tuples | `klynx-api` (writer) / Permify (store) | Permify | written by Phase 2 camera direct grant flow; deleted on profile clear/replace |
| OU→`member`/`admin`→User tuples | Permify | Permify | read by `memberIds` validation; not written by this surface |
| Camera identity | `gateway-api/device_management` (canonical) → `klynx.camera` (projection) | klynx Mongo | read-only here; PATCH validates camera id existence in active org |
| Edge identity | `klynx-api` | `system_edges` (MongoDB) | read-only here; PATCH validates `edgeId` UUID + `isDeleted: { $ne: true }` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `PATCH /kapi/orgs/resource/permissions/{id}` | klynx-api `PermissionProfileService.Update` | klynx-feature admin | full body schema with all binding fields; CAS-less last-write-wins |
| `GET /kapi/orgs/resource/permissions[/{id}]` | klynx-api | klynx-feature | response includes all binding response fields (legacy docs default to `[]`) |
| `POST /kapi/orgs/resource/permissions` | klynx-api | klynx-feature admin | no resource bindings accepted (mirror of existing pattern) |
| `GET /api/v3/resources/edge` | klynx-api `controllers/sysapi/edgeapi/listResource.go` | klynx-feature (Edge tab in slideover) | mirrors camera/kcontrol picker shape |
| `GET /media/stream/{camId}` | klynx-api `mediasvc.AuthorizeCameraStream` + `mapsvc.GetAuthCameraStreamInfo` | klynx-feature live/videowall | resolver gate post-v4.14.0; cross-org public path preserved |
| `GET /api/v3/system/edge` | klynx-api `systemsvc/edgesvc/listEdge.go` | klynx-feature (system devices page) | filter changed 4.19.0 — non-admin callers see only edges in their resolver set |
| `MemberAccessService.ResolveViewableEntityIDs` | klynx-api (internal) | camera/kcontrol/edge `List` endpoints + stream endpoint | union of group-mediated + direct grants; member-narrowed per profile |
| effectiveAccess | klynx-api `authzsvc.GetEffectiveAccess` | klynx-feature sidebar + option/tab/filter visibility | derives `systemDevices*` menu visibility from resource permissions |

---

## 3. Compatibility and Policy

### Backward Compatibility — additive across all phases

- **Phase 1 forward guard (camera-grants):** **breaking** for any pre-4.2.2 caller that mistakenly sent `cameras` / `cameraIds` (those previously got silent 200; now get `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED`). Trade-off accepted because the silent path was a bug.
- **Phase 2 (camera-grants):** additive — `cameras` typed field accepted on PATCH. Pre-Phase-2 docs without `cameraIds` field return `[]` (empty array, not omitted) on read.
- **Phase A (`includeOrgUnitChildren`):** additive — pre-4.3.0 docs missing field deserialize as `false`, resolver behavior unchanged.
- **member-scope (`memberIds`):** additive — pre-4.14.0 docs missing field deserialize as Go zero (empty slice) → `[]` in JSON → no narrowing.
- **edge-grant (`edges` / `edgeIds`):** additive — pre-4.19.0 profiles return `edgeIds: []`; Mongo Insert defaults to `[]` on first write.
- **Stream-endpoint resolver gate (4.14.0):** **tightening** — pre-fix, every authenticated user could stream every own-org camera. Post-fix, non-admin users can only stream cameras in their resolver set. Users without any active permission profile lose own-org streaming. CHANGELOG entry filed under `### Security`.
- **`/system/edge` filter (4.19.0):** **tightening** — pre-fix, non-admin callers see all edges in org. Post-fix, non-admin callers see only edges in their resolver set. Service-account tokens without admin role + no orgUnit membership now return `[]`. CHANGELOG entry filed under `### Changed`.
- **Resource-derived menu visibility (planned):** tightening for regular members without resource grants and additive for regular members with grants. A user with camera / edge access through ResourcePermissionProfile must see the matching menu; a user without grants must not see the menu, select options, tabs, or filters.

**Pre-deploy footgun (memberIds + edges):** modern FE sending the new field against pre-deploy BE → field silently dropped by Go struct binder (same pattern as Phase 1 `cameras`). Mitigation: ship BE before FE; FE must read the field from response to confirm save. We do **not** add Phase-1-style explicit-rejection guards for `memberIds` / `edges` because there is no pre-existing FE that mistakenly sends them.

### Replay / Re-sync Behavior

- GET endpoints idempotent.
- POST not idempotent (creates new profile).
- PATCH is idempotent within the validation envelope (same body → same result).
- **Permify drift recovery:** on `500 INTERNAL "permify sync (cameras|kcontrols|resourceGroups) failed: ..."`, Mongo state may be ahead of Permify. Retry the PATCH with the same body to reconcile.

### Write Authority Policy

- `klynx-api` is the sole writer of `permission_profiles` and the related Permify camera tuples.
- `memberIds` / `edges` writes do NOT generate Permify tuples — pure read-time filter / resolver dispatch (mirrors v4.14.0 pattern).
- `creator` relation handling for cameras (D1/D1a): if `relations` includes `creator` and `cameras` is non-empty, the camera tuple writer **skips the `creator` relation silently** and proceeds with the other relations. The Permify schema for `entity camera` does not expose `creator @orgUnit`. KControl behavior is unchanged.
- KControl differs from camera at onboarding time: MQTT auto-register only creates the preregistered hardware row. Admin approve into org is the permission boundary; only approved org-scoped rows with a `deviceId` can be added to ResourceGroups or granted directly through `kControls`.
- **Atomicity (PATCH):** validate all bindings + all members → persist Mongo `$set` → write/delete Permify tuples for camera. `memberIds` and `edges` write only Mongo (no tuples). If Permify write fails halfway, returns 500 with `permify sync (cameras|kcontrols|resourceGroups) failed`; Mongo state is the new state.
- **CAS-less last-write-wins:** `permission_profiles` does not carry a `version` field; concurrent PATCH-PATCH lands as last-write-wins. No `409 PROFILE_VERSION_CONFLICT`.

### Revision History (preserved verbatim from source contracts)

**camera-grants (Phase 1 + Phase 2 + Phase A + Phase B-Lite/B-Wire):**
- Phase 1 shipped 4.2.2 (PR #66) — forward guard `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` on `cameras` / `cameraIds` JSON keys (any value triggers).
- Phase 2a shipped 4.6.0 — typed `cameras []string` request field; full Cartesian-product Permify tuple writes; `cameraIds` response-only key rejection retained.
- Phase 2b shipped 4.7.1 (PR #81) — `directGrantsByEntityType` resolver dispatch helper; surfaces previously-invisible kcontrol direct grants (latent bug from PR #66 Codex review note 3).
- Phase A shipped 4.3.0 (PR #68) — `includeOrgUnitChildren` flag; descendant expansion in resolver step 3'.
- Phase B-Lite shipped 4.3.0 (PR #68) — `filterVisibility` Mongo field on resourceGroups (no read-side wiring).
- Phase B-Wire shipped 4.5.0 — picker filter wiring (`$ne: "internal"`) originally covered `/live/map/options`, `/map/options`, analytics overview; 4.22.1 tightened this to anonymous `/live/map/options` only so authenticated filters remain permission-controlled.
- Status nil-keep fix shipped 4.7.3 (PR #84) — `body.Status: bool → *bool` with `nilKeepBool` helper; closed regression where omitted `status` silently flipped profile to disabled.

**member-scope (4.14.0 PR #140):**
- rev 1 — added §7 stream-endpoint enforcement after Codex Round 1 surfaced the permissive bypass: pre-fix, any authenticated user knowing a `camId` in their own org could stream it regardless of `memberIds` narrowing. Stream endpoint now consults the resolver gate.

**edge-grant (4.19.0 PR #155):**
- rev 1 → rev 2 — Codex review of PR #155 flagged contract / implementation drift; the original draft described an architecture simpler than what shipped:
  - Mongo collection: `system_edges` (not `edge_devices`); identity field is `edgeId` UUID (not `_id` ObjectID).
  - Soft-delete signal: `isDeleted: { $ne: true }` (not `deletedAt: null`).
  - Auth probe: `organization.manage` (Permify permission name on `entity organization`); legacy phrase `permission.manage` was inherited from gateway-api docs but klynx-api never had that permission.
  - Validation error: `404 NOT_FOUND` with message `edge not found: <edgeId>` (NOT `400 INVALID_EDGE_ID`).
  - **No Permify tuples written for direct edge grants.** `permission_profiles.edgeIds` read at request time via `directGrantsByEntityType("edge")` — same pattern as v4.14.0 `MemberIDs`.
  - No `X-Edge-Filter-Applied` debug header (FE never depended on it).
  - Rollback on edge-grant failure: Mongo write fails → 404 with no partial state (no tuple cleanup needed).

---

## 4. Surface Summary

| Type | Name | Method | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/kapi/orgs/resource/permissions/{id}` | `PATCH` | Bearer + `X-Active-Org` + `organization.manage` | klynx-api `PermissionProfileService.Update` | klynx-feature admin |
| REST | `/kapi/orgs/resource/permissions[/{id}]` | `GET` | Bearer + `X-Active-Org` + scoped read | klynx-api | klynx-feature |
| REST | `/kapi/orgs/resource/permissions` | `POST` | Bearer + `X-Active-Org` + `organization.manage` | klynx-api `PermissionProfileService.Create` | klynx-feature admin |
| REST | `/api/v3/resources/edge` | `GET` | Bearer + `X-Active-Org` + `organization.manage` | klynx-api `controllers/sysapi/edgeapi/listResource.go` | klynx-feature |
| REST | `/media/stream/{camId}` | `GET` | Bearer + `X-Active-Org` + resolver gate (non-admin) | klynx-api `mediasvc.AuthorizeCameraStream` | klynx-feature live/videowall |
| REST | `/api/v3/system/edge` | `GET` | Bearer + `X-Active-Org` | klynx-api `systemsvc/edgesvc/listEdge.go` | klynx-feature systemDevices |
| REST | effectiveAccess | `GET` | Bearer + `X-Active-Org` | klynx-api `authzsvc.GetEffectiveAccess` | klynx-feature sidebar/options/tabs/filters |

---

## 5. REST Surfaces

### 5.1 `PATCH /kapi/orgs/resource/permissions/{profileId}` — full body schema

**Auth:** Bearer JWT + `X-Active-Org` header + caller must have `organization.manage` on the active org.

**Path parameters:**
- `profileId` (string, required) — UUID of the resource permission profile.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `X-Active-Org: <orgId>` (required)
- `Content-Type: application/json` (required)

#### Request body (full v1 schema — combined Phase 1+2, Phase A, member-scope, edge-grant)

```json
{
  "name": "Operations team — Cameras + KControls + Edges",
  "description": "View access for Ops shift",
  "status": true,
  "relations": ["viewer"],
  "orgUnits":       ["ou-uuid-1", "ou-uuid-2"],
  "resourceGroups": ["rg-uuid-1"],
  "resourceDeviceScope": "all",
  "kControls":      ["kctrl-device-id-1"],
  "cameras":        ["cam-uuid-1", "cam-uuid-2"],
  "edges":          ["edge_01J...", "edge_02K..."],
  "memberIds":      ["zin-user-uuid"],
  "includeOrgUnitChildren":       false,
  "includeResourceGroupChildren": false
}
```

#### Field semantics — resource-binding arrays

All five binding arrays (`orgUnits`, `resourceGroups`, `kControls`, `cameras`, `edges`) follow identical nil-keep semantics:

| Value sent | Backend behaviour |
|---|---|
| field absent (key missing in JSON) | keep current value (nil-keep) |
| `null` | keep current value (nil-keep) — equivalent to absence |
| `[]` (explicit empty array) | clear all bindings of that type; for `cameras`, also delete corresponding Permify tuples |
| `["id1", "id2", ...]` | replace bindings; validate each id; for `cameras`, delete old tuples + write new tuples; for `memberIds` / `edges`, Mongo write only |

#### Field semantics — `memberIds`

| Value sent | Backend behaviour |
|---|---|
| field absent / `null` | keep current value |
| `[]` | clear narrowing — profile applies to all matched OU members (today's behavior) |
| `["uid1", "uid2", ...]` | narrow to listed users; validate each via Permify (see below); persist |

**memberIds validation (per uid):**
1. Resolve the **effective** OrgUnit set for the profile after this PATCH:
   - If `orgUnits` is provided in the same body → use the new value.
   - Else → use existing `profile.OrgUnitIDs` from Mongo.
2. For each effective `ouId`, query Permify for `(orgUnit:ouId, member|admin, user:uid)`.
3. If `uid` is a member/admin of **at least one** effective OU → accept.
4. Otherwise → `404 NOT_FOUND "not found: member not in any orgUnit of profile: <uid>"`. No Mongo write.

**Read-time match semantics:** for a profile `p` and a requesting user `u`:

```
(profile-OU intersection with u.expanded-OUs is non-empty)
   AND
(len(p.MemberIDs) == 0  OR  u.userId ∈ p.MemberIDs)
```

The OU intersection check is unchanged from existing behavior (steps 3 + 3' in `MemberAccessService.ResolveViewableEntityIDs`, including `includeOrgUnitChildren` expansion). The MemberIDs check is **added after** OU matching as a narrowing filter. **No Permify schema change.** No new tuples — read-time only, same architectural pattern as `includeOrgUnitChildren`.

#### Field semantics — `edges`

| Value sent | Backend behaviour |
|---|---|
| field absent / `null` | keep current value |
| `[]` | clear all edge grants (`permission_profiles.edgeIds = []`); no tuples to delete (none were written) |
| `["edge_..."]` | replace; validate each edgeId in `system_edges` collection scoped by `X-Active-Org` AND not soft-deleted (`isDeleted: { $ne: true }`); first failing id → `404 NOT_FOUND "not found: edge not found: <edgeId>"`; no partial Mongo write; no tuples |

#### Field semantics — non-binding fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no on PATCH | empty string treated as "keep old" |
| `description` | string | no | empty string treated as "keep old" |
| `status` | `*bool` (nilable) | no | `nil` (omitted/null) → keep current; `&true` / `&false` → set explicitly. Status nil-keep fix: BE 4.7.3 PR #84 changed this from `bool` to `*bool` to close the silent-flip regression where omitted `status` silently flipped profile to disabled (revoking all access). When `status` resolves to `false`, no Permify tuples are written even if bindings are non-empty |
| `relations` | string[] | no | nil = keep old; `[]` = reset to `["viewer"]`; allowed values: `["viewer", "editor", "deleter", "creator"]` |
| `resourceDeviceScope` | string | no | nil/empty = keep current. `"all"` (default/legacy) means selected ResourceGroups grant all devices in those groups plus direct device IDs. `"selected"` means direct IDs (`cameras`, `kControls`, future device types) narrow the selected ResourceGroups to explicitly chosen devices |
| `includeOrgUnitChildren` | `*bool` (nilable) | no | nil = keep current; `true`/`false` = set explicitly. See §10 |
| `includeResourceGroupChildren` | `*bool` (nilable) | no | nil = keep current. **Read-side resolver lives in [`resource-group.md`](./resource-group.md) §5.5** — this contract carries the field through PATCH; the descendant expansion behavior is documented there |

#### `creator` relation handling for cameras (D1/D1a)

If `relations` includes `creator` and `cameras` is non-empty, the camera tuple writer **skips the `creator` relation silently** and proceeds with the other relations. The Permify schema for `entity camera` does not expose `creator @orgUnit`. KControl behavior is unchanged — its schema includes `creator @orgUnit`.

#### Phase 1 forward-defensive rejection — `cameras` / `cameraIds` request keys (HISTORICAL)

Until Phase 2 ships the canonical `cameras []string` request field, both `Create` and `Update` **reject** any payload that contains the JSON key `cameras` or `cameraIds` with `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED`.

| Phase | `cameras` key on request | `cameraIds` key on request |
|---|---|---|
| **Phase 1** (4.2.2) | rejected `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` | rejected `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` |
| **Phase 2** (4.6.0+) | accepted (typed `cameras []string` field) | rejected `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` (response-only field name) |

The trigger is **presence of the JSON key**, not non-emptiness. `{"cameras": []}`, `{"cameras": null}`, and `{"cameras": ["cam-1"]}` all returned 400 in Phase 1.

**Why a guard rather than silent-ignore:** Go's struct binding silently drops unknown JSON keys. That was the original `a932740e` debugging footgun where FE thought it had written camera grants. Phase 1 made the rejection explicit so future / cross-team contributors get a loud failure, not a silent miss.

#### `edgeIds` request-key reject (4.19.0)

Same loud-fail pattern — caller sending the response-only key `edgeIds` on PATCH gets `400 BAD_REQUEST` with the hint:

```text
use 'edges' (request field) — 'edgeIds' is a response-only field name; see docs/contracts/permission-profile.md §5.1
```

Mirrors the Phase 2a `cameraIds` guard.

#### Success response (200)

```json
{
  "code": "SUCCESS",
  "message": "permission profile updated",
  "status": true,
  "details": {
    "id": "profile-uuid",
    "orgId": "org-uuid",
    "name": "Operations team — Cameras + KControls + Edges",
    "description": "View access for Ops shift",
    "status": true,
    "relations": ["viewer"],
    "orgUnitIds":       ["ou-uuid-1", "ou-uuid-2"],
    "resourceGroupIds": ["rg-uuid-1"],
    "kcontrolIds":      ["kctrl-device-id-1"],
    "cameraIds":        ["cam-uuid-1", "cam-uuid-2"],
    "edgeIds":          ["edge_01J...", "edge_02K..."],
    "memberIds":        ["zin-user-uuid"],
    "includeOrgUnitChildren":       false,
    "includeResourceGroupChildren": false,
    "createdBy": "user-uuid",
    "createdAt": "2026-04-30T08:30:00Z",
    "updatedAt": "2026-04-30T10:15:42Z"
  }
}
```

**Request → response field naming asymmetry** (mirrors existing convention):

| FE concept | Request body field | Response body field |
|---|---|---|
| OrgUnit selection | `orgUnits` | `orgUnitIds` |
| ResourceGroup selection | `resourceGroups` | `resourceGroupIds` |
| KControl device selection | `kControls` | `kcontrolIds` |
| Camera device selection (Phase 2) | `cameras` | `cameraIds` |
| Edge device selection (4.19.0) | `edges` | `edgeIds` |
| Member multi-select (4.14.0) | `memberIds` | `memberIds` (same on both — Decision D8 from member-scope plan) |

#### Error contract

| HTTP | code | message format | Cause |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `"invalid body"` | malformed JSON or wrong types |
| 400 | `BAD_REQUEST` | `"invalid relation '<r>', must be creator\|viewer\|editor\|deleter"` | unknown relation in `relations` |
| 400 | `BAD_REQUEST` | `"use 'edges' (request field) — 'edgeIds' is a response-only field name"` | caller sent response-only `edgeIds` key (4.19.0 loud-fail guard) |
| 400 | `CAMERA_DIRECT_GRANTS_UNSUPPORTED` | `"direct per-camera grants are not supported in Phase 1; compose grants via resourceGroup containing the target cameras"` | **Phase 1 historical** (4.2.2 → 4.6.0 lift); request body contains the JSON key `cameras` (any value). Phase 2 (4.6.0+) lifts the `cameras` rejection but `cameraIds` (response-only) rejection stays |
| 403 | `FORBIDDEN` | `"forbidden"` | caller lacks `organization.manage` |
| 404 | `NOT_FOUND` | `"not found: orgUnit not found: <id>"` | unknown OU id |
| 404 | `NOT_FOUND` | `"not found: resourceGroup not found: <id>"` | unknown RG id |
| 404 | `NOT_FOUND` | `"not found: kcontrol device not found: <id>"` | unknown kcontrol id |
| 404 | `NOT_FOUND` | `"not found: camera not found: <id>"` | (Phase 2) camera id not in active org |
| 404 | `NOT_FOUND` | `"not found: edge not found: <id>"` | (4.19.0) edge id not in active org or soft-deleted. Order-sensitive — first failing id is named in the message; FE should not parse the index, only the id name |
| 404 | `NOT_FOUND` | `"not found: member not in any orgUnit of profile: <uid>"` | (4.14.0) uid in `memberIds` is not a Permify member/admin of any effective `OrgUnitIDs` |
| 500 | `INTERNAL` | `"permify sync (cameras) failed: <detail>"` | Mongo persisted but Permify camera tuple write failed; admin should retry |
| 500 | `INTERNAL` | `"permify sync (kcontrols) failed: <detail>"` | (existing kcontrol path) |
| 500 | `INTERNAL` | `"permify sync (resourceGroups) failed: <detail>"` | (existing rg path) |

Mongo state may be ahead of Permify after a 500. Retry the PATCH with the same body to reconcile.

### 5.2 `GET /kapi/orgs/resource/permissions/{profileId}` + list

**Auth:** Bearer JWT, scoped read on the org.

**Detail success response (200):**

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
    "edgeIds":          ["edge_01J..."],
    "memberIds":        [],
    "includeOrgUnitChildren":       false,
    "includeResourceGroupChildren": false,
    "createdBy": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Legacy doc handling:** pre-feature documents missing a binding field are returned with `[]` (empty array, not omitted). `cameraIds` / `edgeIds` / `memberIds` / `kcontrolIds` / `resourceGroupIds` / `orgUnitIds` all follow this convention. Repo Insert path explicitly defaults each field to `[]` on first write.

**List endpoint** `GET /kapi/orgs/resource/permissions`: each item in `details.items[]` follows the same shape as the GET-by-id `details`.

### 5.3 `POST /kapi/orgs/resource/permissions`

**No resource bindings accepted.** Profile creation accepts `name`, `description`, `status`, `relations` only. Admins must PATCH after creation to bind resources. Mirrors the existing pattern from before Phase 2.

### 5.4 `GET /api/v3/resources/edge` (NEW — 4.19.0)

Paginated list of edge devices in the active org. Used by the Resource Permission slideover ("Edge" tab) to render the picker. Mirrors `GET /api/v3/resources/camera` and `/api/v3/resources/kcontrol`.

**Auth:** Bearer JWT + `X-Active-Org`; caller must hold `organization.manage`. Route uses standard `AuthBearer + ActiveOrg` middleware **and** controller does explicit `CheckPermissionWithSchemaVersion(... "organization", orgId, "manage", "user", callerId)` probe before serving — non-admins get 403 even if the route ever loosens its middleware.

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
  "details": {
    "items": [
      { "id": "edge_01J...", "type": "ata", "name": "ATA-Bangkok-01",
        "url": "https://ata.example.local", "tls": true,
        "createdAt": "...", "updatedAt": "..." }
    ]
  },
  "pagination": { "page": 1, "perPage": 10, "totalRecords": 7, "totalPages": 1, "sortField": "createdAt", "sortOrder": "desc" }
}
```

**Notes:**
- `id` is the edge's `edgeId` UUID (the same value stored on `permission_profiles.edgeIds` and consumed by the `/system/edge` filter). The Mongo `_id` (ObjectID hex) is **not** exposed.
- The picker shows `name + type`. `username`, `apiKey`, `apiSecret`, `passEnc`, `apiSecretEnc` are intentionally NOT included (projection-stripped at the repo layer).
- Empty list returns `details.items: []` and `pagination.totalRecords: 0` (NOT 404).
- Sort fixed to `createdAt desc` for v1.

**Errors:** 400 `BAD_REQUEST` (unsupported `type`); 401 `UNAUTHORIZED`; 403 `FORBIDDEN` (missing `X-Active-Org` OR caller lacks `organization.manage`); 500 `INTERNAL_ERROR`.

### 5.5 `GET /media/stream/{camId}` — resolver gate (4.14.0 PR #140)

**Auth:** Bearer JWT + `X-Active-Org` + resolver gate (non-admin).

**Authorization rules:**

| Step | Check | Outcome |
|---|---|---|
| 1 | Fetch camera doc by `camId` | not found → existing `404 NOT_FOUND "camera not found"` |
| 2 | `doc.OrgID != orgId` AND `doc.MapVisibility ∈ {public, forcePublic}` | **cross-org public path** — skip steps 3–4, fall through to existing `GetAuthCameraStreamInfo`. (Anonymous-friendly behavior preserved.) |
| 3 | `doc.OrgID != orgId` AND public-visibility check fails | existing `403 FORBIDDEN "camera does not belong to the active org"` |
| 4 | Admin bypass — `authzClient.CheckPermissionWithSchemaVersion(ctx, tenantId, "", "organization", orgId, "manage", "user", userId)` returns `true` | **allowed** — fall through to existing `GetAuthCameraStreamInfo` |
| 5 | Non-admin gate — `ids := ResolveViewableEntityIDs(ctx, tenantId, orgId, userId, "camera")`; `camId ∈ ids` | **allowed** — fall through |
| 6 | Non-admin gate — `camId ∉ ids` | **`403 FORBIDDEN`** with code `FORBIDDEN`, message `"camera is not in caller's allowed set"` |
| 7 | All passes | existing `GetAuthCameraStreamInfo` flow runs (active-state check, RTSP build, ZLM ensure, session issue) |

**Why admin bypass is a Permify `organization.manage` check, not a Permify `Check(camera, view, user, userId)`:** `Check(camera, cam-001, view, user, amp)` would return `true` for any user whose OU has tuples on the camera, defeating `memberIds` narrowing. The `organization.manage` check captures only "real org-admins" (owner + admin role) — that's what we want. Decision D9 from member-scope plan.

**Cross-org public preservation (call ordering matters):** the cross-org public check (step 2) runs **before** the resolver gate. Without this ordering, a public cross-org camera would fail the resolver (resolver only returns own-org camIds for the caller) and incorrectly return 403. The helper must inspect `doc.OrgID` + `doc.MapVisibility` first.

**Error contract (post-fix):**

| HTTP | code | message | Cause |
|---|---|---|---|
| 403 | `FORBIDDEN` | `"camera does not belong to the active org"` | (existing) cross-org camera that fails public-visibility check |
| 403 | `FORBIDDEN` | `"camera is not in caller's allowed set"` | **NEW (4.14.0)** — non-admin caller's resolver set does not contain `camId` |
| 403 | `FORBIDDEN` | `"camera is not active"` | (existing) `doc.State` not active/synced/empty |

The two distinct 403 messages let FE / ops distinguish "wrong org" from "scoped out of caller's reach" without reading log lines.

**Implementation:** service helper `mediasvc.AuthorizeCameraStream(ctx, tenantId, orgId, userId, camId) error` (Decision D10 — gate placement at service layer, not controller-level wiring or middleware). Controller flow:

```go
controller:
  doc, err := mapsvc.PreflightCameraStream(ctx, camId, orgId)  // org boundary + cross-org public + state check
  if err != nil { handle (404 / 403 wrong-org / 403 inactive) }
  if !crossOrgPublic(doc, orgId) {
      err = mediasvc.AuthorizeCameraStream(ctx, tenantId, orgId, userId, camId)
      if err is ErrForbidden { return 403 "camera is not in caller's allowed set" }
  }
  // existing flow: BuildRTSPSourceURL → ensure → issue session → 200
```

### 5.6 `GET /api/v3/system/edge` — filter behavior change (4.19.0)

**Auth:** Bearer JWT + `X-Active-Org`.

**Filter logic** (as implemented in `internal/services/systemsvc/edgesvc/listEdge.go`):

```text
1. Resolve userId, orgId, tenantId from auth context.
2. If orgId is empty → 403 (existing behaviour).
3. Probe Permify: organization.manage on (orgId, callerId).
   - true  → return all non-soft-deleted edges in the org (no allowedIDs filter).
   - false → call edgeAccessResolver.ResolveViewableEntityIDs(tenantId, orgId, userId, "edge").
     The resolver:
       a. Loads user's direct + descendant orgUnits (existing Phase A path).
       b. Loads active permission profiles whose orgUnitIds intersect that set
          (with IncludeOrgUnitChildren expansion + memberIds narrowing applied).
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

**Behavior for callers without any active permission profile** (e.g. service accounts not on the admin path, fresh users post-invite who have not yet been bound to a profile):
- `ResolveViewableEntityIDs` returns `[]` → filter yields zero edges.
- This is a **tightening** vs pre-4.19.0, where the same caller would have seen the full org list. CHANGELOG entry filed under `### Changed`. Mirrors v4.14.0 `MemberIDs` rollout note for own-org streaming.

**Response shape:** unchanged. Same envelope as today. **No FE debugging header.** The `X-Edge-Filter-Applied: true` header proposed in Codex draft was not shipped — FE never wired against it.

### 5.7 Resource-Derived Menu Visibility (planned)

This section defines how Resource Permission Profiles affect menu visibility. It is intentionally part of the permission-profile contract because the menu decision is derived from the same resolver, relations, and member / OU narrowing rules as the resource access decision.

#### Rule

```text
if platformRole == "administrator":
  existing platform-admin menu behavior applies
else if caller has organization.manage in active org:
  existing org-admin menu behavior applies
else:
  cameraIds = ResolveViewableEntityIDs(..., "camera")
  edgeIds   = ResolveViewableEntityIDs(..., "edge")

  if len(cameraIds) > 0:
    visibleMenuIds += ["systemDevices", "systemDevicesCameras"]

  if len(edgeIds) > 0:
    visibleMenuIds += ["systemDevices", "systemDevicesEdge"]
```

Parent menu handling remains additive: if any `systemDevices` child is visible, `systemDevices` MUST be visible.

#### Default hide policy

For regular members:

| Resource grant state | Required menu result |
|---|---|
| no camera grant, no edge grant | hide `systemDevices`, `systemDevicesCameras`, `systemDevicesEdge` unless another visible child exists |
| camera grant only | show `systemDevices` + `systemDevicesCameras`; hide `systemDevicesEdge` |
| edge grant only | show `systemDevices` + `systemDevicesEdge`; hide `systemDevicesCameras` |
| camera + edge grants | show `systemDevices`, `systemDevicesCameras`, `systemDevicesEdge` |

Frontend MUST apply the same policy to select options, filters, and tabs. Examples:

- If `systemDevicesEdge` is absent, hide every `edgeDevice` option/tab/filter in permission editors, dashboards, and device pickers.
- `systemDevicesEdge` is not a platform-admin auto menu. It is seeded as a `businessFeature`/grantable menu so Edge stays hidden by default until the menu is explicitly granted or an edge resource grant derives it for a regular member.
- `GET /options?ns=klynx` MUST include ancestor groups for grantable business-feature leaves. Example: `systemDevicesEdge` is a business-feature leaf under the `systemDevices` group, while `systemDevices` itself is a platform-admin group. The options tree must return `systemDevices -> systemDevicesEdge`; otherwise the leaf becomes an orphan and the permission UI cannot grant it.
- If `systemDevicesCameras` is absent, hide CCTV/camera options except public live-map surfaces that are intentionally anonymous/public.
- Direct URLs remain backend-gated; FE hiding is not the security boundary.

#### Relation-to-action matrix

When a regular member reaches a resource page, action availability is derived from the union of relations across all matching active profiles:

| Relation | FE action visibility | Backend enforcement |
|---|---|---|
| `viewer` | list/detail/stream; export only if treated as read-only | allow read; deny create/update/delete |
| `creator` | add camera; import rows that create new cameras | `403 FORBIDDEN` when create/import-create is attempted without it |
| `editor` | edit camera; mapVisibility toggle; import rows that update existing cameras | `403 FORBIDDEN` when update/import-update is attempted without it |
| `deleter` | delete camera | `403 FORBIDDEN` when delete is attempted without it |

Multiple profiles compose by union. Missing relation means deny. A camera granted by profile A (`viewer`, `editor`) and profile B (`viewer`, `deleter`) yields `viewer`, `editor`, `deleter`; `creator` remains denied.

#### Bootstep / menu option source

Backend must expose the Klynx menu option list from the menu registry / effectiveAccess layer, not from hardcoded FE constants. FE must use backend menu IDs as the source of truth for:

- sidebar entries
- route tabs
- resource-type select options
- dashboard / report filters
- permission-profile advanced tabs

If a menu ID is not present in `visibleMenuIds`, all corresponding UI affordances are hidden even if the route component still exists in the bundle.

---

## 6. Kafka / Async Event Surfaces

`N/A — not in scope.` All flows are REST. Permify tuple writes are synchronous adapter calls.

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` No realtime push for permission profile state. Profile editor + camera/edge lists poll.

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` Resolver consults Mongo + Permify on every request. `memberIds` / `edgeIds` are read on every resolver call without intermediate cache; cross-request cache deferred (would require version counter on profile writes).

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Permify Schema Change (Phase 2 — camera-grants only)

Existing `entity camera`:

```permify
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

Phase 2 additive change:

```permify
entity camera {
    relation parentOrg    @organization
    relation parentGroup  @resourceGroup
    relation liveOperator @orgUnit
    relation ptzOperator  @orgUnit
    relation creator      @user
    relation viewer       @orgUnit   // NEW (Phase 2)
    relation editor       @orgUnit   // NEW (Phase 2)
    relation deleter      @orgUnit   // NEW (Phase 2)

    permission view   = viewer.view  or parentGroup.view   or parentOrg.manage
    permission edit   = editor.manage or parentGroup.edit  or parentOrg.manage
    permission delete = deleter.manage or parentGroup.delete or parentOrg.manage
    permission live   = liveOperator.view or parentOrg.manage
    permission ptz    = ptzOperator.view or parentOrg.manage
}
```

**Additive guarantees:**
- No relation removed or renamed.
- No permission removed. Each existing rule extended with `or <new>` clauses → any subject that had access before still has access.
- `creator @user` preserved unchanged (D1).

**Edge entity — NO schema bump.** Existing `entity edge` covers `parentOrg` / `parentGroup` / `creator` relations consumed by `edgesvc.CreateEdge`. Direct edge grants are read-time-only via `directGrantsByEntityType("edge")` — same pattern as `MemberIDs`. If a future phase wants `Check(edge:X view user:U)` RPC support, that phase opens its own plan + schema addendum.

### 9.2 Tuple Shape (Phase 2 camera direct grants)

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

**`memberIds` / `edges` write NO Permify tuples** — narrowing/grant happens entirely in the resolver.

### 9.3 Mongo Model

```go
// models/authzmod/permissionProfile.go
type PermissionProfile struct {
    // ... existing fields ...
    OrgUnitIDs       []string `bson:"orgUnitIds"       json:"orgUnitIds"`
    ResourceGroupIDs []string `bson:"resourceGroupIds" json:"resourceGroupIds"`
    ResourceDeviceScope string `bson:"resourceDeviceScope" json:"resourceDeviceScope,omitempty"` // all|selected
    KControlIDs      []string `bson:"kcontrolIds"      json:"kcontrolIds"`
    CameraIDs        []string `bson:"cameraIds"        json:"cameraIds"`        // Phase 2
    EdgeIDs          []string `bson:"edgeIds"          json:"edgeIds"`          // 4.19.0
    MemberIDs        []string `bson:"memberIds"        json:"memberIds"`        // 4.14.0

    Status                       *bool `bson:"status,omitempty"                       json:"status,omitempty"`                       // 4.7.3 nil-keep
    IncludeOrgUnitChildren       *bool `bson:"includeOrgUnitChildren,omitempty"       json:"includeOrgUnitChildren,omitempty"`       // 4.3.0
    IncludeResourceGroupChildren *bool `bson:"includeResourceGroupChildren,omitempty" json:"includeResourceGroupChildren,omitempty"` // 4.7.2
    // ... existing fields ...
}
```

**Indexes:** none new. Resolver iterates profiles already filtered by OU intersection — no additional Mongo query against `memberIds` / `edgeIds`.

**Migration:** none. Pre-feature docs deserialize missing keys as Go zero (empty slice / `nil` pointer) → `[]` / `false` in JSON → no narrowing / pre-feature behavior. Insert path explicitly defaults each binding field to `[]`.

### 9.4 Resolver Behavior (Read Path)

`MemberAccessService.ResolveViewableEntityIDs(ctx, tenantId, orgId, userId, entityType)` returns the union of:

1. **OU intersection check** (existing): for each profile, check if `profile.OrgUnitIDs ∩ user.expandedOUs` is non-empty (with `IncludeOrgUnitChildren` Phase A descendant expansion if set).
2. **Member narrowing filter** (4.14.0): for each surviving profile, drop if `len(profile.MemberIDs) > 0 AND userId ∉ profile.MemberIDs` (per pure helper `profileAppliesToMember`):

```go
// internal/services/authzsvc/resolveAccess.go
func profileAppliesToMember(profile authzmod.PermissionProfile, userID string) bool {
    if len(profile.MemberIDs) == 0 {
        return true
    }
    for _, uid := range profile.MemberIDs {
        if uid == userID { return true }
    }
    return false
}
```

3. **Group-mediated path** (existing): walk `profile.ResourceGroupIDs` (with Phase C2 `IncludeResourceGroupChildren` expansion if set — see `resource-group.md` §5.5), then list Permify tuples with subject `resourceGroup:rgID`, filter by `entityType` and `relation == "parentGroup"`.
4. **Direct entity grants path** (Phase 2b + 4.14.0 + 4.19.0): for each surviving profile, dispatch via `directGrantsByEntityType(profile, entityType)`:

```go
func directGrantsByEntityType(profile authzmod.PermissionProfile, entityType string) []string {
    switch entityType {
    case "camera":  return profile.CameraIDs
    case "kcontrol": return profile.KControlIDs
    case "edge":    return profile.EdgeIDs
    default:        return nil
    }
}
```

5. `resourceDeviceScope` composition:
   - `"all"` / missing (default): result is the deduplicated union of group-mediated + direct grants.
   - `"selected"` with selected ResourceGroups: direct IDs are used as a narrowing filter; result is `group-mediated ∩ direct`. Example: RG `ภายใน` contains `front1, fl2`, profile `cameras:["fl2"]` returns only `fl2`.
   - `"selected"` without ResourceGroups: direct IDs still work as direct grants.

**Composition with companion features:**
- **OrgUnit child expansion (Phase A v4.3.0):** `memberIds` filter runs *after* OU match (including descendant expansion). Composition: descendant expansion + member narrowing compose cleanly.
- **ResourceGroup child expansion (Phase C2 v4.7.2):** Unrelated — runs in step 3 (rg expansion), after profile filter. No interaction. Read-side resolver lives in `resource-group.md`.
- **Direct camera/kcontrol/edge grants:** Unrelated to filter — direct grants come from already-matched profiles. If `memberIds` filters a profile out for user `u`, none of that profile's direct grants reach `u`.
- **Stream endpoint (§5.5):** Consumes the same resolver result; for non-admin callers, `camId` must be in `ResolveViewableEntityIDs(..., "camera")` or the request returns 403.

**Regression protection (Phase 2b PR #81):** the kcontrol direct-grants path is exercised by the `directGrantsByEntityType` change. A profile with only `kcontrolIds` set (no resourceGroups, no cameras) MUST resolve correctly through the new branch. Pre-2b the resolver only walked `profile.ResourceGroupIDs` → kcontrol direct tuples (written by Phase 0) never surfaced. Closing this latent bug was Decision-D8 of camera-grants Phase 2 plan.

### 9.5 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `permission_profiles.{name, description}` | klynx-api | admin | Mongo | last-writer-wins |
| `permission_profiles.status` | klynx-api | admin | Mongo | `*bool` nil-keep (4.7.3) |
| `permission_profiles.relations` | klynx-api | admin | Mongo | nil = keep; `[]` = reset to `["viewer"]` |
| `permission_profiles.{orgUnitIds, resourceGroupIds, kcontrolIds, cameraIds, edgeIds}` | klynx-api `PermissionProfileService.Update` | admin via PATCH | Mongo | full-replace on PATCH |
| `permission_profiles.memberIds` | klynx-api | admin via PATCH | Mongo | validated via Permify before persist |
| `permission_profiles.includeOrgUnitChildren` | klynx-api | admin via PATCH | Mongo | `*bool` nil-keep |
| `permission_profiles.includeResourceGroupChildren` | klynx-api | admin via PATCH | Mongo | `*bool` nil-keep; consumed by `resource-group.md` §5.5 resolver |
| Camera→`viewer`/`editor`/`deleter`→OU tuples | klynx-api `writeCameraTuples` | profile PATCH | Permify | full-replace tuple-set on PATCH |
| KControl tuples | klynx-api `writeKControlTuples` | profile PATCH | Permify | (existing, unchanged) |
| ResourceGroup tuples | klynx-api | profile PATCH | Permify | (existing) |
| OU member/admin tuples | Permify (read by `memberIds` validation) | (existing OU management surface) | Permify | not written by this surface |
| `system_edges.{edgeId, isDeleted, ...}` | klynx-api `edgesvc.CreateEdge` (existing) | (separate edge management surface) | Mongo | read-only here; PATCH validates id existence |

### 9.6 Conflict Resolution / Atomicity

- **Atomicity (PATCH):** validate all bindings + all members + all edges → persist Mongo `$set` → write/delete Permify tuples for camera. `memberIds` and `edges` write only Mongo (no tuples). If Permify write fails halfway, returns 500 with `permify sync (cameras|kcontrols|resourceGroups) failed`; Mongo state is the new state.
- **CAS-less last-write-wins:** no `version` field; concurrent PATCH-PATCH lands as last-write-wins.
- **Permify drift:** retry the same PATCH body to reconcile Mongo↔Permify.
- **Caveat (memberIds Decision D6):** Amp could still hit Permify directly with a `Check(camera:cam-001, view, user:amp)` — Permify would say `allowed=true` because Amp is in `ou-sanitation` and the tuple `(camera:cam-001, viewer, orgUnit:ou-sanitation)` exists. **This is acceptable** because:
  - klynx-api lists / serves cameras through the resolver, never via raw Permify Check from FE.
  - Server-side enforcement remains correct via `ResolveViewableEntityIDs`.
  - A future hardening (Permify schema additive with `@user` relations) is a separate plan if the gap matters; D6 trade-off is documented.

---

## 10. Phase A — `includeOrgUnitChildren` (v4.3.0, PR #68)

Companion plan: [docs/plan/done/permission-profile-orgunit-and-rg-filter-visibility.md](../plan/done/permission-profile-orgunit-and-rg-filter-visibility.md).

### Purpose

By default, a permission profile bound to an orgUnit (e.g. `อำเภอเมือง`) applies only to users whose direct orgUnit (or its descendants in the user-side BFS) intersects the profile's `orgUnitIDs`. Users in the **descendants** of the profile's bound orgUnit (e.g. `ตำบลรอง`, `หมู่บ้าน...`) do NOT inherit access automatically.

`includeOrgUnitChildren` is an opt-in flag on the profile that flips this default for the bound profile only — when `true`, the resolver expands the profile's `orgUnitIDs` to include all descendants at request time, so the profile applies to users in those descendants too.

### Resolver behavior matrix

| Scenario | `includeOrgUnitChildren` | User's orgUnit | profile.orgUnitIDs | Match? |
|---|---|---|---|---|
| Direct user in bound OU | `false` (default) | อำเภอเมือง | `["อำเภอเมือง"]` | ✅ |
| User in descendant of bound OU | `false` (default) | ตำบลรอง | `["อำเภอเมือง"]` | ❌ — default isolates levels |
| User in descendant of bound OU | `true` (opt-in) | ตำบลรอง | `["อำเภอเมือง"]` | ✅ — descendant expansion catches it |
| Direct user in bound OU | `true` (opt-in) | อำเภอเมือง | `["อำเภอเมือง"]` | ✅ |
| User in unrelated OU | (any) | อำเภอข้างเคียง | `["อำเภอเมือง"]` | ❌ |
| Existing profile, field never set | (default `false`) | (any) | (any) | preserves pre-v4.3.0 behavior exactly |

### Implementation note

Read-side only: the resolver's flag-true expansion path (`ResolveViewableEntityIDs` step 3') walks `orgUnitRepo.FindDescendants` per flag-true profile. Permify tuples are NOT denormalized for descendants — source of truth stays the orgUnit tree at request time.

### FE guidance

- Render an opt-in checkbox **"รวมหน่วยงานย่อย"** beside the orgUnit picker on the permission-profile editor. Default unchecked.
- Suggested chip representation: `อำเภอเมือง + หน่วยงานย่อย` when checked.
- No migration required.

### See also

- ResourceGroup `filterVisibility` (Phase B-Lite shipped 4.3.0; Live-only semantics tightened 2026-05-05): documented in [`resource-group.md`](./resource-group.md) §3 + §9.4. The picker filter on anonymous `/live/map/options` excludes `filterVisibility="internal"` rgs; authenticated `/map/options` and permission-profile pickers do NOT consult this field — internal rgs remain valid permission targets.
- `includeResourceGroupChildren` (Phase C2 shipped 4.7.2): documented in [`resource-group.md`](./resource-group.md) §5.5. The flag is carried through PATCH on this surface; the read-side resolver behavior lives in resource-group.

---

## 11. Frontend Field Mapping

### Type definitions

```ts
export type ResourcePermissionProfileDetail = {
  id: string
  name: string
  description: string
  status: boolean
  relations: string[]                  // ["viewer", "editor", "deleter", "creator"]
  orgUnitIds:                          string[]
  resourceGroupIds:                    string[]
  kcontrolIds:                         string[]
  cameraIds:                           string[]   // Phase 2
  edgeIds:                             string[]   // 4.19.0
  memberIds:                           string[]   // 4.14.0
  includeOrgUnitChildren:              boolean    // 4.3.0
  includeResourceGroupChildren:        boolean    // 4.7.2
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ResourcePermissionProfilePatch = {
  name?: string
  description?: string
  status?: boolean
  relations?: string[]
  orgUnits?: string[]
  resourceGroups?: string[]
  kControls?: string[]
  cameras?: string[]                  // Phase 2
  edges?: string[]                    // 4.19.0
  memberIds?: string[]                // 4.14.0
  includeOrgUnitChildren?: boolean
  includeResourceGroupChildren?: boolean
}
```

### `applyAdvanced()` switch (klynx-feature)

```ts
const payloadKeyByType: Record<string, 'kControls' | 'cameras' | 'resourceGroups' | 'edges'> = {
  kcontrol:      'kControls',
  camera:        'cameras',
  resourceGroup: 'resourceGroups',
  edge:          'edges',
}
const key = payloadKeyByType[advancedSelectedType.value]
await updateProfile({ [key]: advancedSelectedItems.value.map(d => d.deviceId ?? d.id) })
```

### FE flow — member multi-select (4.14.0)

1. Admin selects OrgUnit(s) on the profile editor.
2. UI lists members of the selected OUs via existing `GET /kapi/orgs/units/{id}/members` (already returns `userId`, `firstName`, `lastName`, `email`, `enabled`).
3. UI renders a multi-select with the union of those members. Default = empty (no narrowing).
4. On save, FE PATCH body includes `memberIds: <selected>` (or omits to keep, or sends `[]` to clear).
5. Chip representation when `memberIds` non-empty: `{ouName} → {memberCount} คน`.

### FE Guardrails

- Treat absent fields as `[]`, not `undefined`, when calling PATCH (so users can explicitly clear grants).
- Send `cameras` / `edges` / `memberIds` / `kControls` / `resourceGroups` / `orgUnits` (request-form keys), never `cameraIds` / `edgeIds` / `kcontrolIds` / `resourceGroupIds` / `orgUnitIds` (response-only keys). Sending response-only keys triggers `400` loud-fail.
- Read `cameraIds` / `edgeIds` / `memberIds` etc from the response to confirm save (mitigates pre-deploy footgun where modern FE talks to pre-deploy BE).
- Status field: default to `true` on the editor; do not omit on PATCH if the user explicitly toggled.
- Do not show a resource-type tab, select option, filter option, or shortcut if its menu ID is absent from `visibleMenuIds`. `systemDevicesEdge` controls edgeDevice affordances; `systemDevicesCameras` controls CCTV/camera affordances.
- Do not use local hardcoded menu lists for Klynx option bootstrapping unless they are only a fallback while the backend menu registry is unavailable.

---

## 12. Examples

### 12.1 Phase 1 happy path (FE re-frame, ResourceGroup-only)

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "resourceGroups": ["rg-uuid-1"], "status": true }
```

Behavior identical to today (no `cameras` / `cameraIds` keys → guard passes through).

### 12.2 Phase 1 forward guard fires (was previously silent 200)

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "resourceGroups": ["rg-uuid-1"], "cameras": ["cam-001"] }
```

```json
{ "code": "CAMERA_DIRECT_GRANTS_UNSUPPORTED",
  "message": "direct per-camera grants are not supported in Phase 1; ...",
  "status": false }
```

HTTP `400`. No Mongo write, no Permify write.

### 12.3 Phase 2 add a single camera

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "cameras": ["cam-001"], "status": true }
```

Response: `200`, `details.cameraIds: ["cam-001"]`. `resourceGroupIds` and `orgUnitIds` preserved (their fields were absent → nil semantics).

### 12.4 Phase 2 clear cameras

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "cameras": [] }
```

All `(camera:*, *, orgUnit:*)` tuples for this profile deleted. Mongo `cameraIds = []`. Other bindings untouched.

### 12.5 Phase 2 unknown camera

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "cameras": ["does-not-exist"] }
```

`404 NOT_FOUND` `"not found: camera not found: does-not-exist"`. No Mongo write.

### 12.6 Member narrowing — Zin + Amp scenario

Setup. Profile `abc-123` already binds `orgUnits: [ou-sanitation]`, `cameras: [60-camera-set]`, `relations: [viewer]`, `status: true`. Today every member of `ou-sanitation` sees all 60 cameras.

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "memberIds": ["zin-uid"] }
```

Backend:
1. Validate Zin is a member of `ou-sanitation` via Permify. ✅
2. Persist `$set memberIds = ["zin-uid"]`.
3. **No tuple changes.** Camera tuples remain on `(camera:*, viewer, orgUnit:ou-sanitation)`.

Effect:
- Zin → `ResolveViewableEntityIDs("camera")` → profile matches OU + matches MemberIDs → 60 cameras.
- Amp → profile matches OU but FAILS MemberIDs filter → profile dropped → 60 cameras NOT returned.

### 12.7 Member not in profile's OUs

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "memberIds": ["bob-uid"] }
```

Bob is in `ou-sales`, not sanitation. → `404 NOT_FOUND` `"not found: member not in any orgUnit of profile: bob-uid"`. No Mongo write.

### 12.8 Stream endpoint blocks guessed camId (Codex rev 1)

Setup: Profile P binds `orgUnits=[ou-sanitation]`, `cameras=[60-camera-set]`, `memberIds=[zin-uid]`. Amp is in ou-sanitation but not in `memberIds`.

```http
GET /media/stream/cam-001
Authorization: Bearer <amp-jwt>
X-Active-Org: <sanitation-org-id>
```

Backend flow:
1. `CheckPermission(organization, sanitation-org, manage, user, amp)` → `false`.
2. `ResolveViewableEntityIDs(ctx, tenantId, sanitation-org, amp, "camera")` → `[]` (P filtered out).
3. `cam-001` not in returned set → block.

```json
{ "code": "FORBIDDEN",
  "message": "camera is not in caller's allowed set",
  "status": false }
```

Same request from **Zin** (in `memberIds`): resolver returns 60-set → `cam-001` ∈ set → fall through → `200` + play URL.

Same request from **org-admin**: `CheckPermission → true` → admin bypass → fall through → `200`.

**Cross-org public camera** (preservation test): step 2 of §5.5 sees `doc.OrgID != activeOrg && doc.MapVisibility ∈ {public, forcePublic}` → cross-org public path; resolver gate skipped. → `200`.

### 12.9 Edge clear and add (4.19.0)

```text
PATCH .../prof_X
body: { "edges": [] }
→ 200, details.edgeIds = []
→ Mongo: permission_profiles.edgeIds = [] (no Permify tuples touched).
→ subsequent GET /system/edge as non-admin user bound to prof_X returns items: [].
```

```text
PATCH .../prof_X
body: { "edges": ["edge_A", "edge_B"] }
→ 200, details.edgeIds = ["edge_A", "edge_B"]
→ GET /system/edge as user bound to prof_X (non-admin) returns items: [{ id: "edge_A", ... }, { id: "edge_B", ... }].
```

### 12.10 Unknown / soft-deleted edge id

```text
PATCH .../prof_X
body: { "edges": ["edge_A", "edge_DELETED"] }
→ 404, code: NOT_FOUND, message: "not found: edge not found: edge_DELETED"
→ Mongo NOT mutated (validation runs before $set; first failing id aborts).
→ Order-sensitive — first failing id is named in the message; FE should not parse the index, only the id name.
```

### 12.11 Admin bypass on `/system/edge`

```text
GET /system/edge as user with organization.manage (owner / admin)
→ 200, items: <all non-soft-deleted edges in org>, no resolver call.
→ Response shape unchanged from pre-4.19.0 admin path.
```

### 12.12 `/system/edge` no profile binding (non-admin) — tightening

```text
GET /system/edge as user with no permission profile bound AND no organization.manage
→ 200, items: []
→ This is the tightening change — pre-4.19.0 returned the full org list.
```

### 12.13 Filter narrows pagination total

```text
Org has 50 edges. User bound to profile with edgeIds=[3 ids].
GET /system/edge?perPage=10
→ pagination.totalRecords = 3 (NOT 50)
→ pagination.totalPages = 1
→ items.length = 3
```

### 12.14 Response-only key reject — `edgeIds` (4.19.0 loud-fail)

```text
PATCH .../prof_X
body: { "edgeIds": ["edge_A"] }
→ 400, code: BAD_REQUEST,
   message: "use 'edges' (request field) — 'edgeIds' is a response-only field name; ..."
→ Mongo NOT mutated.
```

### 12.15 Multiple profiles compose

OU `ou-sanitation` has 100 members. Two profiles bind to it:

| Profile | memberIds | cameras | Effect |
|---|---|---|---|
| P1 | `[]` (no narrowing) | `[80-camera-set]` | all 100 members see those 80 |
| P2 | `[zin-uid]` | `[20-extra-cameras]` | only Zin sees the 20 extra |

For Zin: union = 80 + 20 = **100 cameras**.
For Amp: union = 80 (from P1) + 0 (P2 filtered out) = **80 cameras**.

The change-request example *"Zin = 60, Amp = 65"* is achieved by:

| Profile | memberIds | cameras |
|---|---|---|
| Px | `[zin-uid]` | `[60-camera-subset]` |
| Py | `[amp-uid]` | `[65-camera-subset]` |

(Two profiles, one per member group.)

### 12.16 Atomic OU + member + cameras + edges

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "orgUnits":  ["ou-sanitation", "ou-water"],
  "cameras":   ["cam-001", "cam-002"],
  "edges":     ["edge_A"],
  "memberIds": ["zin-uid"]
}
```

Validation order:
1. Resolve effective `OrgUnitIDs` = `["ou-sanitation", "ou-water"]` (from new value).
2. Validate each ou exists in active org.
3. Validate each camera id, kcontrol id, edge id (`system_edges` + `isDeleted: { $ne: true }`).
4. Validate Zin is a member of `ou-sanitation` OR `ou-water`.
5. Persist Mongo + write/delete Permify tuples for camera bindings (no tuples for memberIds/edges).

If Zin is not in either OU OR any edge id is unknown → `404 NOT_FOUND`, no write.

---

## 13. Out of Scope (Not in This Contract)

- **Per-member relations override.** Decision D5 in member-scope plan.
- **Per-member POST creation.** Profile must be created without `memberIds`; admins must PATCH after. Decision D2.
- **Permify schema additive (`@user` relations).** Decision D6 — read-time-filter approach is sufficient; future hardening for direct Permify Checks from FE is a separate plan.
- **Bulk member operations.** "Remove user X from all profiles' memberIds" follow-up if needed; today the resolver gracefully ignores stale ids.
- **Snapshot endpoints, recording playback, kcontrol `/operate` paths** for the parallel resolver-bypass pattern. Audited as separate follow-up tasks per member-scope §14.
- **Soft-delete cascade on edge delete.** When an edge is soft-deleted, its id remains on `permission_profiles.edgeIds`. The `/system/edge` filter naturally excludes soft-deleted edges (`isDeleted: { $ne: true }`). A one-shot cleanup job can trim orphan ids if drift is observed; not blocking.
- **Service-account flow on `/system/edge`.** Same admin-role probe applies. Service-account tokens with admin role return all edges; without admin role they go through the resolver (returns `[]` if no profile binding for the underlying user). Acceptable for v1.

---

## 14. Compatibility Matrix

| Caller / FE state | This BE deployed | Behavior |
|---|---|---|
| FE doesn't send `cameras`/`edges`/`memberIds` (legacy FE) | yes | nil-keep — Mongo fields unchanged from prior state |
| FE sends `cameras: []` / `edges: []` / `memberIds: []` (modern FE clearing) | yes | clears bindings (camera tuple-set deleted; edges/memberIds Mongo only) |
| FE sends `cameras: [id]` / `edges: [id]` / `memberIds: [uid]` | yes | sets; validation may reject with 404 |
| FE sends `cameras: [id]` (modern FE) | **no (pre-Phase-2 BE)** | Phase 1 BE rejects `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` (loud-fail guard) |
| FE sends `edges: [id]` / `memberIds: [uid]` (modern FE) | **no (pre-deploy)** | field silently dropped by Go struct binder. **Mitigation:** ship BE before FE; FE must read field from response to confirm save |
| FE sends response-only `cameraIds` / `edgeIds` on PATCH | yes | rejected `400 CAMERA_DIRECT_GRANTS_UNSUPPORTED` / `400 BAD_REQUEST` (loud-fail guards) |
| Modern FE reads `edgeIds` / `memberIds` from response | yes | populated; legacy docs return `[]` (not omitted) |

---

## 15. Decisions (preserved verbatim from source contracts)

**camera-grants:**
- **D1/D1a (creator skip):** if `relations` includes `creator` and `cameras` is non-empty, the camera tuple writer skips `creator` silently and proceeds with the other relations. Permify schema for `entity camera` does not expose `creator @orgUnit`.

**member-scope:**
- **D2:** per-member POST creation NOT in this contract — must use PATCH after Create.
- **D5:** per-member relations override NOT in this contract.
- **D6:** Permify schema additive (`@user` relations) NOT in this contract — read-time-filter approach is sufficient.
- **D8:** response field is `memberIds` (same name as request), unlike `cameras → cameraIds` etc.
- **D9:** stream-endpoint admin bypass uses `organization.manage`, NOT `Check(camera, view, user, userId)` — the latter would defeat memberIds narrowing.
- **D10:** stream-endpoint gate placement = service helper `mediasvc.AuthorizeCameraStream`, not controller-level wiring or middleware.

**edge-grant (rev 2):**
- **No Permify schema bump.** Direct edge grants are read-time-only via resolver `directGrantsByEntityType("edge")` — same pattern as `MemberIDs`. If a future phase wants `Check(edge:X view user:U)` RPC support, that phase opens its own plan + schema addendum and writes the migration tuples.
- **Soft-delete signal:** `isDeleted: { $ne: true }` (not `deletedAt: null`).
- **Auth probe:** `organization.manage` Permify permission (legacy `permission.manage` was inherited from gateway-api docs but klynx-api never had that permission).
- **Validation error:** `404 NOT_FOUND` with message `edge not found: <edgeId>` (NOT `400 INVALID_EDGE_ID`).
- **No `X-Edge-Filter-Applied` debug header** (FE never depended on it).
- **`pagination.totalRecords` reflects filtered count** (NOT org total) — pagination applied AFTER the filter.

---

## 16. Implementation evidence

| Surface | File | Note |
|---|---|---|
| `PATCH /orgs/resource/permissions/{id}` controller | [controllers/authzapi/resourcePermissions.go](../../controllers/authzapi/resourcePermissions.go) | `+ Edges []string`; `rejectCameraIdsOnRequest`, `rejectEdgeIdsOnRequest` guards |
| Permission profile service | [internal/services/authzsvc/permissionProfileSvc.go](../../internal/services/authzsvc/permissionProfileSvc.go) | `+ edgeRepo`; `+ EdgeIDs` validation block (mirrors CameraIDs) |
| Resolver dispatch | [internal/services/authzsvc/resolveAccess.go](../../internal/services/authzsvc/resolveAccess.go) | `directGrantsByEntityType` covers camera/kcontrol/edge; `profileAppliesToMember` member filter |
| Mongo model | [models/authzmod/permissionProfile.go](../../models/authzmod/permissionProfile.go) | `+ CameraIDs`, `+ EdgeIDs`, `+ MemberIDs`, `*Status`, `*IncludeOrgUnitChildren`, `*IncludeResourceGroupChildren` |
| Repo Insert defaults | [internal/repo/authzrepo/permissionProfile.go](../../internal/repo/authzrepo/permissionProfile.go) | Insert defaults all binding fields to `[]` |
| Picker — `/api/v3/resources/edge` | [controllers/sysapi/edgeapi/listResource.go](../../controllers/sysapi/edgeapi/listResource.go), [internal/repo/edgerepo/edge.go](../../internal/repo/edgerepo/edge.go) | New handler with explicit `organization.manage` probe |
| Filter consumer — `/api/v3/system/edge` | [internal/services/systemsvc/edgesvc/listEdge.go](../../internal/services/systemsvc/edgesvc/listEdge.go) | `EdgeAccessResolver` interface; resolver dispatch is the only delta |
| Stream endpoint gate | `internal/services/mediasvc/streamAuthz.go` (`AuthorizeCameraStream`) | 4.14.0 service helper; controller flow per §5.5 |
| Container wiring | [internal/app/container.go](../../internal/app/container.go) | `edgerepo.NewEdgeRepo()` passed to `NewPermissionProfileService` |
| Tests | `internal/services/authzsvc/resolveAccess_directGrants_test.go`, `controllers/authzapi/resourcePermissions_edge_guard_test.go`, etc. | 4 dispatch tests + 7 guard tests; full `go test ./...` 42 packages, 0 failures |

---

## 17. Checklist

- [x] Domain / flow boundary explicit (§0 — single PATCH endpoint with all binding types; sibling contracts referenced via §0 + §10).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (permission_profiles, system_edges, klynx.camera, Permify tuples, OU member tuples).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope (6 REST surfaces + Permify writer).
- [x] REST request, response, and error contracts defined for all 6 endpoints (full error matrix preserved verbatim across phases).
- [x] All field semantics for binding arrays explicit (nil-keep / `[]` clear / replace; same rule for orgUnits/resourceGroups/kControls/cameras/edges/memberIds).
- [x] Phase 1 forward guard preserved (CAMERA_DIRECT_GRANTS_UNSUPPORTED).
- [x] Phase 2 Permify schema diff preserved (additive viewer/editor/deleter @orgUnit).
- [x] Tuple shape preserved (Cartesian product; `creator` skip).
- [x] memberIds read-time-only filter preserved (profileAppliesToMember pure helper; Permify validation per uid).
- [x] Edge grants read-time-only preserved (no schema bump; directGrantsByEntityType("edge")).
- [x] Stream endpoint enforcement preserved (D9/D10; cross-org public ordering; admin bypass via organization.manage).
- [x] /system/edge filter behavior preserved (admin bypass; tightening for non-admin without profile).
- [x] Phase A includeOrgUnitChildren preserved (resolver matrix; FE checkbox guidance).
- [x] Status nil-keep fix (4.7.3) preserved.
- [x] Field naming asymmetry preserved (`<entity>` request ↔ `<entity>Ids` response; loud-fail guards on response-only keys).
- [x] Kafka N/A — explained.
- [x] MQTT N/A — explained.
- [x] Redis N/A — explained.
- [x] Compatibility matrix covers pre-deploy footgun for memberIds + edges.
- [x] Examples cover Phase 1 / Phase 2 / member-scope / edge / stream endpoint / multiple profiles compose / atomic mixed update.
- [x] Decisions (D1, D2, D5, D6, D8, D9, D10, edge rev 2) preserved verbatim.
- [x] Implementation evidence table preserved.

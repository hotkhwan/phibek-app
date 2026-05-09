# Contract — Permission Profile Per-Member Scope

**Plan:** [docs/plan/permission-profile-member-scope.md](../plan/permission-profile-member-scope.md)
**Owner:** klynx-api
**Status:** Superseded by [`permission-profile.md`](./permission-profile.md) on 2026-05-04 — member-scope + camera-grants + edge-grant merged into one Permission Profile lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All `memberIds` read-time-only narrowing (per-uid Permify validation, `profileAppliesToMember` pure helper, no Permify tuples written) + Codex rev 1 stream-endpoint enforcement (`mediasvc.AuthorizeCameraStream`, cross-org public preservation via call ordering, admin bypass via `organization.manage` per D9, gate placement at service-helper layer per D10) preserved verbatim in §5.1 / §5.5 / §9.4 of the merged contract. Body kept here for PR / Codex review history.
**Target version:** 4.14.0 (planned)
**Companion contract:** [permission-profile-camera-grants.md](permission-profile-camera-grants.md) — this contract extends that one with a single new field; all unspecified behavior (envelope shape, nil-keep semantics, status / orgUnits / resourceGroups / kControls / cameras / includeOrgUnitChildren / includeResourceGroupChildren rules) is inherited verbatim.

---

## 1. Field Addition

| Field | Type | Where | Default | Semantics |
|---|---|---|---|---|
| `memberIds` | `string[]` | request body of `PATCH /kapi/orgs/resource/permissions/{id}`; response `details.*` of GET-by-id and list items; `permission_profiles.memberIds` in Mongo | `[]` | optional per-user narrowing of which members the profile applies to. **Empty / absent = applies to all matched OU members (today's behavior).** |

### Nil / empty / set semantics (request body)

Inherits the same nil-keep contract as `orgUnits` / `resourceGroups` / `kControls` / `cameras`:

| Value sent | Backend behaviour |
|---|---|
| field absent (key missing in JSON) | keep current value (nil-keep) |
| `null` | keep current value (nil-keep) — equivalent to absence |
| `[]` (explicit empty array) | clear narrowing — profile applies to all matched OU members |
| `["uid1", "uid2", ...]` | narrow to listed users; validate each id; persist |

### Read-time match semantics

For a profile `p` and a requesting user `u`, the profile applies to `u` iff:

```
(profile-OU intersection with u.expanded-OUs is non-empty)
   AND
(len(p.MemberIDs) == 0  OR  u.userId ∈ p.MemberIDs)
```

The OU intersection check is unchanged from existing behavior (steps 3 + 3' in `MemberAccessService.ResolveViewableEntityIDs`, including `includeOrgUnitChildren` expansion). The MemberIDs check is **added after** OU matching as a narrowing filter.

**No Permify schema change.** No new tuples. The filter is read-time only — same architectural pattern as `includeOrgUnitChildren` (Phase A, v4.3.0).

---

## 2. Endpoint Surface

### `PATCH /kapi/orgs/resource/permissions/{profileId}`

**Auth:** Bearer JWT + `X-Active-Org`; caller must have `organization.manage`.

#### Request body addition

```json
{
  "name": "Sanitation — flood watch (Zin only)",
  "orgUnits":   ["ou-sanitation"],
  "cameras":    ["cam-001", "cam-002", "...60-cameras..."],
  "relations":  ["viewer"],
  "status":     true,
  "memberIds":  ["zin-user-uuid"]
}
```

#### Validation rule (new)

For each `uid` in the **provided** `memberIds`:

1. Resolve the **effective** OrgUnit set for the profile after this PATCH:
   - If `orgUnits` is provided in the same body → use the new value.
   - Else → use the existing `profile.OrgUnitIDs` from Mongo.
2. For each effective `ouId`, query Permify for `(orgUnit:ouId, member|admin, user:uid)`.
3. If `uid` is a member/admin of **at least one** effective OU → accept.
4. Otherwise → return:

```json
{
  "code": "NOT_FOUND",
  "message": "not found: member not in any orgUnit of profile: <uid>",
  "status": false
}
```

HTTP `404`. No Mongo write occurs.

This validation is parallel to the existing `cameras` / `kControls` validation: each id is checked against an authoritative source before persisting.

#### Atomicity

- Validate all bindings + members → persist Mongo `$set` → write/delete Permify tuples.
- Tuple writes are **unchanged**. `memberIds` does NOT generate any Permify tuples. (The narrowing happens entirely in the resolver.)

#### Success response (200)

```json
{
  "code": "SUCCESS",
  "message": "permission profile updated",
  "status": true,
  "details": {
    "id": "profile-uuid",
    "orgId": "org-uuid",
    "name": "Sanitation — flood watch (Zin only)",
    "status": true,
    "relations": ["viewer"],
    "orgUnitIds":       ["ou-sanitation"],
    "resourceGroupIds": [],
    "kcontrolIds":      [],
    "cameraIds":        ["cam-001", "cam-002", "..."],
    "memberIds":        ["zin-user-uuid"],
    "includeOrgUnitChildren":       false,
    "includeResourceGroupChildren": false,
    "createdBy": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Note: response field is `memberIds` (same name as request — Decision D8 in plan).

#### Error contract (additions to camera-grants contract §1)

| HTTP | code | message format | Cause |
|---|---|---|---|
| 404 | `NOT_FOUND` | `"not found: member not in any orgUnit of profile: <uid>"` | **NEW** — uid in `memberIds` is not a Permify member/admin of any effective `OrgUnitIDs` of the profile |

All other error rows from `permission-profile-camera-grants.md` §1 still apply unchanged.

---

### `GET /kapi/orgs/resource/permissions/{profileId}`

#### Success response (200)

`details.memberIds: string[]` is added. Pre-feature documents missing the field are returned as `[]` (empty array, not omitted) — same convention as `cameraIds` after Phase 2.

```json
{
  "code": "SUCCESS",
  "status": true,
  "details": {
    "id": "...",
    "orgUnitIds":       [...],
    "resourceGroupIds": [...],
    "kcontrolIds":      [...],
    "cameraIds":        [...],
    "memberIds":        [],
    ...
  }
}
```

---

### `GET /kapi/orgs/resource/permissions`

List endpoint. Each item in `details.items[]` carries `memberIds: string[]` with the same legacy-doc handling as the GET-by-id response.

---

### `POST /kapi/orgs/resource/permissions`

**No change.** Profile creation does not accept `memberIds`. Admins must PATCH after creation. Mirrors the existing pattern for `resourceGroups` / `kControls` / `cameras`.

---

## 3. Resolver Behavior (Read Path)

### Pseudocode addition

```go
// internal/services/authzsvc/resolveAccess.go

// profileAppliesToMember reports whether a profile's memberIds narrowing
// admits the given userID. Pure helper for unit testing.
//
// Empty/nil MemberIDs = no narrowing = applies to all matched OU members
// (today's behavior, preserves backward compat for legacy docs).
func profileAppliesToMember(profile authzmod.PermissionProfile, userID string) bool {
    if len(profile.MemberIDs) == 0 {
        return true
    }
    for _, uid := range profile.MemberIDs {
        if uid == userID {
            return true
        }
    }
    return false
}

// In ResolveViewableEntityIDs, after step 3' (flag-true expansion) and
// before step 4 (rg collection):
filtered := make([]authzmod.PermissionProfile, 0, len(profiles))
for _, p := range profiles {
    if profileAppliesToMember(p, userID) {
        filtered = append(filtered, p)
    }
}
profiles = filtered
```

### Behavior matrix

| Scenario | profile.OrgUnitIDs | profile.MemberIDs | user OU intersect? | user in MemberIDs? | Profile applies? |
|---|---|---|---|---|---|
| Today's behavior (no narrowing) | `[ou1]` | `[]` | yes | n/a | ✅ |
| Today's behavior (no OU match) | `[ou1]` | `[]` | no | n/a | ❌ |
| Narrowing — included member | `[ou1]` | `[zin]` | yes (zin in ou1) | yes | ✅ |
| Narrowing — excluded member | `[ou1]` | `[zin]` | yes (amp in ou1) | no | ❌ — filter drops profile for amp |
| Narrowing — multiple members | `[ou1]` | `[zin, amp]` | yes (zin in ou1) | yes | ✅ |
| Narrowing — stale member after OU drift | `[ou-newer]` | `[zin]` | yes (some other user in ou-newer) | n/a (zin removed from ou-newer) | profile applies to whoever passes both checks; Zin won't ever satisfy `OU intersect` so they get filtered out at step 3 anyway |
| Legacy doc (no memberIds field) | `[ou1]` | (zero, empty slice) | yes | n/a | ✅ (legacy = `[]` = no narrowing) |
| `includeOrgUnitChildren=true` + memberIds | `[amphoe]` (`includeChildren=true`) | `[zin]` | yes — zin in tambon-rong (descendant of amphoe) | yes | ✅ — descendant expansion + member narrowing compose cleanly |

### Composition with companion features

- **OrgUnit child expansion (Phase A v4.3.0).** `memberIds` filter runs *after* OU match (including descendant expansion). Composition is straightforward — see last row of matrix above.
- **ResourceGroup child expansion (Phase C2 v4.7.2).** Unrelated — runs in step 4 (rg expansion), after profile filter. No interaction.
- **Direct camera/kcontrol grants (Phase 2a/2b v4.6.0/v4.7.1).** Unrelated to filter — direct grants come from already-matched profiles. If `memberIds` filters a profile out for user `u`, none of that profile's direct grants reach `u`. Exactly the desired behavior.
- **Stream endpoint (Codex rev 1, see §7).** `GET /media/stream/{camId}` consumes the same resolver result; for non-admin callers, the camId must be in `ResolveViewableEntityIDs(..., "camera")` or the request returns 403.

---

## 4. Mongo Model

```go
// models/authzmod/permissionProfile.go
type PermissionProfile struct {
    // ... existing fields ...
    OrgUnitIDs       []string `bson:"orgUnitIds"       json:"orgUnitIds"`
    ResourceGroupIDs []string `bson:"resourceGroupIds" json:"resourceGroupIds"`
    KControlIDs      []string `bson:"kcontrolIds"      json:"kcontrolIds"`
    CameraIDs        []string `bson:"cameraIds"        json:"cameraIds"`
    MemberIDs        []string `bson:"memberIds"        json:"memberIds"`        // NEW
    // ... existing fields ...
}
```

**Indexes:** none new. Resolver iterates profiles already filtered by OU intersection — no additional Mongo query against `memberIds`.

**Migration:** none. Pre-feature docs deserialize the missing key as Go zero (empty slice) → `[]` in JSON → no narrowing.

---

## 5. FE Field Mapping

| FE concept | Request body field | Response body field |
|---|---|---|
| OrgUnit selection | `orgUnits` | `orgUnitIds` |
| Member multi-select (NEW) | `memberIds` | `memberIds` |
| ResourceGroup selection | `resourceGroups` | `resourceGroupIds` |
| KControl device selection | `kControls` | `kcontrolIds` |
| Camera device selection | `cameras` | `cameraIds` |

**FE flow (klynx-feature, separate task):**

1. Admin selects OrgUnit(s) on the profile editor.
2. UI lists members of the selected OUs via existing `GET /kapi/orgs/units/{id}/members` (already returns `userId`, `firstName`, `lastName`, `email`, `enabled`).
3. UI renders a multi-select with the union of those members. Default = empty (no narrowing).
4. On save, FE PATCH body includes `memberIds: <selected>` (or omits the key to keep, or sends `[]` to clear).
5. Chip representation when `memberIds` is non-empty: `{ouName} → {memberCount} คน`.

**TypeScript type addition:**

```ts
export type MenuPermissionProfileDetailResponse = {
  // ... existing fields ...
  orgUnitIds:                  string[]
  resourceGroupIds:            string[]
  kcontrolIds:                 string[]
  cameraIds:                   string[]
  memberIds:                   string[]   // NEW
  includeOrgUnitChildren:      boolean
  includeResourceGroupChildren: boolean
  // ...
}
```

---

## 6. Examples

### Example A — Add member narrowing to existing profile

**Setup.** Profile `abc-123` already binds `orgUnits: [ou-sanitation]`, `cameras: [60-camera-set]`, `relations: [viewer]`, `status: true`. Today every member of `ou-sanitation` sees all 60 cameras.

**Action.** Admin narrows to Zin only:

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "memberIds": ["zin-uid"] }
```

**Backend.**
1. Validate Zin is a member of `ou-sanitation` via Permify. ✅
2. Persist `$set memberIds = ["zin-uid"]`.
3. **No tuple changes.** Camera tuples remain on `(camera:*, viewer, orgUnit:ou-sanitation)` — these continue to grant `view` permission *in Permify* to all OU members. **The narrowing happens at the application resolver, not at Permify.** This is intentional (Decision D6).

**Effect.**
- Zin → `ResolveViewableEntityIDs("camera")` → profile `abc-123` matches OU + matches MemberIDs → 60 cameras returned.
- Amp → profile `abc-123` matches OU but FAILS MemberIDs filter → profile dropped → 60 cameras NOT returned (unless another profile grants them).

**Caveat.** Amp could still hit Permify directly with a `Check(camera:cam-001, view, user:amp)` — Permify would say `allowed=true` because Amp is in `ou-sanitation` and the tuple `(camera:cam-001, viewer, orgUnit:ou-sanitation)` exists. **This is acceptable** because:
- klynx-api lists / serves cameras through the resolver, never via raw Permify Check from FE.
- Server-side enforcement remains correct via `ResolveViewableEntityIDs`.
- A future hardening (Permify schema additive with `@user` relations) is a separate plan if the gap matters; D6 trade-off is documented.

### Example B — Clear member narrowing

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "memberIds": [] }
```

`$set memberIds = []`. Profile reverts to "applies to all OU members" — Zin and Amp both see 60 cameras again.

### Example C — Member not in profile's OUs

**Setup.** Profile `abc-123` has `orgUnits: [ou-sanitation]`. Bob is in `ou-sales`, not sanitation.

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{ "memberIds": ["bob-uid"] }
```

**Response (404):**

```json
{
  "code": "NOT_FOUND",
  "message": "not found: member not in any orgUnit of profile: bob-uid",
  "status": false
}
```

No Mongo write. No tuple change.

### Example D — Atomic OU + member update

```http
PATCH /kapi/orgs/resource/permissions/abc-123
{
  "orgUnits":  ["ou-sanitation", "ou-water"],
  "memberIds": ["zin-uid"]
}
```

Validation order:
1. Resolve effective `OrgUnitIDs` = `["ou-sanitation", "ou-water"]` (from new value).
2. Validate each ou exists in active org. ✅
3. Validate Zin is a member of `ou-sanitation` OR `ou-water`. ✅
4. Persist Mongo + write/delete Permify tuples for OU/RG/cam/kctrl bindings.

If Zin is not in either OU → `404 NOT_FOUND`, no write.

### Example E — Multiple profiles compose

**Setup.** OU `ou-sanitation` has 100 members. Two profiles bind to it:

| Profile | memberIds | cameras | Effect |
|---|---|---|---|
| P1 | `[]` (no narrowing) | `[80-camera-set]` | all 100 members see those 80 |
| P2 | `[zin-uid]` | `[20-extra-cameras]` | only Zin sees the 20 extra |

For Zin: union = 80 + 20 = **100 cameras**.
For Amp: union = 80 (from P1) + 0 (P2 filtered out) = **80 cameras**.
For someone outside `ou-sanitation`: 0 cameras from either.

This composition matches the change-request example: *"Zin = 60, Amp = 65"* is achieved by:

| Profile | memberIds | cameras |
|---|---|---|
| Px | `[zin-uid]` | `[60-camera-subset]` |
| Py | `[amp-uid]` | `[65-camera-subset]` |

(Two profiles, one per member group.)

### Example F — Stream endpoint blocks guessed camId (Codex rev 1)

**Setup.** Profile P binds `orgUnits=[ou-sanitation]`, `cameras=[60-camera-set]`, `memberIds=[zin-uid]`. Amp is in ou-sanitation but not in `memberIds`. The sanitation org has 200 cameras total; the 60-set is a subset. Amp also has no other profile granting any of those 60 cameras.

**Pre-fix (today's behavior).** Amp queries `GET /kapi/resources/camera` → resolver returns 0 cameras (P is filtered out). Amp guesses `cam-001` (one of the 60). `GET /media/stream/cam-001` returns **200 OK + play URL** because the stream endpoint only checks org boundary, and `cam-001` is in `ou-sanitation`'s org. ⚠️ Contract violation — Amp can stream a camera the resolver explicitly excluded.

**Post-fix.**

```http
GET /media/stream/cam-001
Authorization: Bearer <amp-jwt>
X-Active-Org: <sanitation-org-id>
```

Backend flow:
1. `authzClient.CheckPermission(organization, sanitation-org, manage, user, amp)` → `false` (Amp is not org-manager).
2. `ResolveViewableEntityIDs(ctx, tenantId, sanitation-org, amp, "camera")` → `[]` (P filtered out by memberIds, no other profile grants).
3. `cam-001` not in returned set → block.

Response (`403`):

```json
{
  "code": "FORBIDDEN",
  "message": "camera is not in caller's allowed set",
  "status": false
}
```

**Same request from Zin (in `memberIds`):**
1. CheckPermission → false (Zin is not org-manager).
2. Resolver returns the 60-set (P matches Zin's OU + memberIds).
3. `cam-001` ∈ set → fall through to existing `GetAuthCameraStreamInfo` → 200 + play URL.

**Same request from org-admin:**
1. CheckPermission → **true** → admin bypass → fall through to existing `GetAuthCameraStreamInfo` → 200. Resolver never invoked. Preserves existing operator workflow.

**Cross-org public camera (preservation test):**

```http
GET /media/stream/public-cross-org-cam-id
```

Backend flow (controller hands off to the helper):
1. Helper fetches camera doc.
2. `doc.OrgID != activeOrg && doc.MapVisibility ∈ {public, forcePublic}` → cross-org public path; **resolver gate is skipped**, existing `GetAuthCameraStreamInfo` path proceeds. 200 + play URL.

This preservation is why the helper inspects the camera doc before invoking the resolver — see §7 ordering rules.

---

## 7. Stream Endpoint Enforcement (Codex rev 1)

### Problem

Pre-rev-1 the contract said *"klynx-api lists / serves cameras through the resolver"* (Example A note). That is correct for **list** endpoints (`/kapi/resources/camera`, `/kapi/resources/kcontrol`, `/kapi/edges` all flow through `ResolveViewableEntityIDs`) but **incorrect for the streaming endpoint**:

- [`controllers/mediapi/authStream.go:53`](../../controllers/mediapi/authStream.go) calls `mapsvc.GetAuthCameraStreamInfo(ctx, camID, orgID)` — passes only `camID` and `orgID`, not `userID` / `tenantID`.
- [`internal/services/mapsvc/authStream.go:59`](../../internal/services/mapsvc/authStream.go) explicitly comments *"Own-org cameras: always allowed"* and only enforces:
  1. camera doc exists,
  2. `doc.OrgID == orgID` OR `doc.MapVisibility ∈ {public, forcePublic}` (cross-org public path),
  3. `doc.State` is active/synced/empty.

So a non-admin user who knows a `camId` in their own org can stream it regardless of which profiles grant them access. With `memberIds` shipped, this directly contradicts the per-member narrowing the contract promises — Amp is filtered out of the camera *list* but can still stream cameras he should not see.

This section adds the resolver gate to the stream endpoint to match the contract semantics.

### Scope of the change

- **In scope:** `GET /media/stream/{camId}` — authenticated stream initiation.
- **Out of scope:** anonymous / cross-org public stream, snapshot endpoints, recording playback, kcontrol `operate` paths. Audited as separate follow-up tasks (see plan §14 Open Questions).

### Authorization rules (post-fix)

For `GET /media/stream/{camId}` with caller `userId` and active org `orgId`:

| Step | Check | Outcome |
|---|---|---|
| 1 | Fetch camera doc by `camId` | not found → existing `404 NOT_FOUND "camera not found"` |
| 2 | `doc.OrgID != orgId` AND `doc.MapVisibility ∈ {public, forcePublic}` | **cross-org public path** — skip steps 3–4, fall through to existing `GetAuthCameraStreamInfo`. (Anonymous-friendly behavior preserved.) |
| 3 | `doc.OrgID != orgId` AND public-visibility check fails | existing `403 FORBIDDEN "camera does not belong to the active org"` (unchanged) |
| 4 | Admin bypass — `authzClient.CheckPermissionWithSchemaVersion(ctx, tenantId, "", "organization", orgId, "manage", "user", userId)` returns `true` | **allowed** — fall through to existing `GetAuthCameraStreamInfo`. |
| 5 | Non-admin gate — `ids := ResolveViewableEntityIDs(ctx, tenantId, orgId, userId, "camera")`; `camId ∈ ids` | **allowed** — fall through. |
| 6 | Non-admin gate — `camId ∉ ids` | **`403 FORBIDDEN`** with code `FORBIDDEN`, message `"camera is not in caller's allowed set"`. |
| 7 | All passes | existing `GetAuthCameraStreamInfo` flow runs (active-state check, RTSP build, ZLM ensure, session issue) |

**Why admin bypass is a Permify `organization.manage` check, not a Permify `Check(camera, view, user, userId)`:**

Permify `Check(camera, cam-001, view, user, amp)` would return `true` for Amp because the tuple `(camera:cam-001, viewer, orgUnit:ou-sanitation)` exists and Amp is a member of `ou-sanitation`. That's the very gap memberIds is closing — Permify doesn't model the per-user narrowing. The `organization.manage` check captures only "real org-admins" (owner + admin role) which is what we want. See plan §12 Decision D9.

### Cross-org public preservation (call ordering matters)

The cross-org public check (step 2 above) runs **before** the resolver gate. Without this ordering, a public cross-org camera would fail the resolver (because the resolver only returns own-org camIds for the caller) and incorrectly return 403. The helper must inspect `doc.OrgID` + `doc.MapVisibility` first.

### Error contract

| HTTP | code | message | Cause |
|---|---|---|---|
| 403 | `FORBIDDEN` | `"camera does not belong to the active org"` | (existing) cross-org camera that fails the public-visibility check |
| 403 | `FORBIDDEN` | `"camera is not in caller's allowed set"` | **NEW** — non-admin caller's resolver set does not contain `camId` |
| 403 | `FORBIDDEN` | `"camera is not active"` | (existing) `doc.State` not active/synced/empty |

The two distinct 403 messages let FE / ops distinguish "wrong org" from "scoped out of caller's reach" without reading log lines.

### Implementation outline

Per Decision D10, gate placement is a **service helper** (not controller-level wiring, not middleware):

```go
// internal/services/mediasvc/streamAuthz.go (NEW)
package mediasvc

// AuthorizeCameraStream returns nil when the caller is allowed to start a
// stream for the given camera, or an error mapped by the controller to
// HTTP status.
//
// Authorization order:
//   1. (caller side) the doc fetch + cross-org public path is enforced inside
//      mapsvc.GetAuthCameraStreamInfo today; this helper is invoked AFTER the
//      controller has the doc OR runs in parallel with a fresh fetch — see
//      implementation note below.
//   2. Permify org.manage check — admin bypass.
//   3. ResolveViewableEntityIDs("camera") — must contain camId.
func AuthorizeCameraStream(
    ctx context.Context,
    tenantId, orgId, userId, camId string,
) error { /* ... */ }
```

Implementation choice (left to PR):
- (a) Helper takes the camera doc as a parameter and consumes the same fetch from `mapsvc.GetAuthCameraStreamInfo` (avoids duplicate Mongo read).
- (b) Helper does its own narrow camera fetch (`FindByCamIDAndOrg`) for the org-boundary check and lets `GetAuthCameraStreamInfo` re-fetch.

Both are acceptable; (a) is preferred for cleanliness — the controller flow becomes:

```text
controller:
  doc, err := mapsvc.PreflightCameraStream(ctx, camId, orgId)  // org boundary + cross-org public + state check
  if err != nil { handle (404 / 403 wrong-org / 403 inactive) }
  if !crossOrgPublic(doc, orgId) {
      err = mediasvc.AuthorizeCameraStream(ctx, tenantId, orgId, userId, camId)
      if err is ErrForbidden { return 403 "camera is not in caller's allowed set" }
  }
  // existing flow: BuildRTSPSourceURL → ensure → issue session → 200
```

This keeps the cross-org public path unchanged AND keeps the resolver gate ON for own-org cameras.

### Test surface

Unit tests for `mediasvc.AuthorizeCameraStream` (4 cases — admin allowed; non-admin in resolver set allowed; non-admin not in set forbidden; cross-org public bypass — though this last case may be covered at the controller integration level depending on placement choice (a) vs (b)).

Cluster smoke (added to plan §2 Success Criteria):
- (e) Amp not in resolver set → `GET /media/stream/{camId}` → `403 "camera is not in caller's allowed set"`.
- (f) Org-admin → `GET /media/stream/{camId}` → `200`.

### Backward compatibility / risk

- **Tightening change.** Pre-fix, *every* authenticated user could stream every own-org camera. Post-fix, non-admin users can only stream cameras in their resolver set. Users without any active permission profile lose own-org streaming.
  - Migration path: the typical org has org-admins and OU-members-with-profiles; the latter already get cameras via the resolver, so they keep working. The narrow tightening hits "OU members with no profile bound to them" — they were previously over-permissioned by accident, and the fix is the desired behavior.
- **PR notes / CHANGELOG `### Security`.** Mark this PR's CHANGELOG entry under `### Security` even if `version.go` only bumps a minor (4.13.0 → 4.14.0) — the change closes a permissive bypass.
- **Rollback escape hatch (optional).** A `STREAM_RESOLVER_GATE=off` env flag can short-circuit the new gate to restore pre-fix behavior in cluster if a runtime issue surfaces. Not added by default; only as planned mitigation if Codex Round 2 asks for it.

---

## 8. Out-of-scope Notes

- **Per-member relations override.** Not in this contract — see Decision D5 in the plan.
- **Per-member POST creation.** Not in this contract — must use PATCH after Create. Decision D2 in the plan.
- **Permify schema additive (`@user` relations).** Not in this contract — Decision D6. The read-time-filter approach is sufficient for klynx-api enforcement; a future hardening for direct Permify Checks from FE is a separate plan.
- **Bulk member operations.** Not in this contract. An admin endpoint to "remove user X from all profiles' memberIds" is a follow-up if needed; today the resolver gracefully ignores stale ids.

---

## 9. Compatibility Matrix

| Caller / FE state | This BE deployed | Behavior |
|---|---|---|
| FE doesn't send `memberIds` (legacy FE) | yes | nil-keep — Mongo field unchanged from prior state (legacy docs stay `[]`) |
| FE sends `memberIds: []` (modern FE clearing) | yes | clears narrowing |
| FE sends `memberIds: [uid]` (modern FE narrowing) | yes | narrows; validation may reject with 404 |
| FE sends `memberIds: [uid]` (modern FE) | **no (pre-deploy)** | field silently dropped by Go struct binder — same footgun pattern as Phase 1 `cameras`. **Mitigation:** ship BE before FE; FE must read `memberIds` from response to confirm save. |

The pre-deploy footgun is symmetric to the Phase 1 `cameras` issue (resolved by adding the explicit `rejectCameraIdsOnRequest` guard). For `memberIds` this risk is lower because the field name is new (no prior caller) and the BE-before-FE rollout order (see plan §9 Rollout Plan) ensures BE ships first; we do **not** add a Phase-1-style explicit-rejection guard for `memberIds` because there is no pre-existing FE that mistakenly sends it.

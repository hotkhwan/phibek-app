# Camera List Org-Admin Scope Contract

**Date:** 2026-04-27
**Status:** Superseded by [`device-camera-domain.md`](./device-camera-domain.md) on 2026-05-04 — visibility scope alignment for `GET /resources/camera` + `GET /map/camera` merged into one Camera Domain operations contract per the new domain/flow grouping rule (`docs/contracts/README.md`). Decision tree (3 branches: platform admin / org admin via Permify `organization:manage` / regular member via resource-group expansion), Permify-failure → `502 PERMIFY_UNAVAILABLE` rule, tuple authority table, and Bug #2 alignment rationale all preserved verbatim in §5.1 of the merged contract. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/cameraListOrgAdminScope.md](../plan/cameraListOrgAdminScope.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST (behavior alignment — no new endpoint)
**Version:** v1

---

## 1. Purpose

Documents the **visibility scope rule** that governs which cameras a caller sees in
`GET /resources/camera` (CCTV list) and `GET /map/camera` (Map view). Both endpoints
must use the same rule so org-admins do not see different camera counts on the two
surfaces. Bug #2 surfaced because the two endpoints had drifted apart — this
contract is the canonical alignment.

The HTTP request/response of both endpoints is **not changed by this contract** —
only the internal visibility computation is contractualized so the two paths cannot
silently re-diverge.

---

## 2. Visibility scope rule

Given a caller with `userId`, an active `orgId`, and a global `platformRole`, the
set of cameras returned is determined by this decision tree, applied identically by
both endpoints:

```text
if platformRole == "administrator":
    return all cameras in orgId
else if Permify Check(subject="user:{userId}", relation="manage", entity="organization:{orgId}") == true:
    return all cameras in orgId           ← org-admin: bypasses resource-group filter
else:
    allowedIds = Permify LookupEntities resource-group membership for userId
    return cameras in orgId WHERE camId IN allowedIds
```

Rules in plain English:

- **Platform administrator** sees everything in the active org. (No Permify check needed; the realm role is authoritative.)
- **Org administrator** (Permify `organization:{orgId}:manage`) sees everything in their active org, regardless of resource-group membership.
- **Regular org member** sees only cameras whose Permify resource-group tuples include them as a viewer or higher.

## 3. Producer / Consumer mapping

| Surface | Handler | Visibility rule applied at |
|---|---|---|
| `GET /resources/camera` | `controllers/deviceapi/CameraController.List` | `internal/services/devicesvc/CameraService.List` |
| `GET /map/camera` | `controllers/mapapi/CameraMap` | `internal/services/mapsvc/MapService.GetCameraMap` |

Both call sites MUST follow the §2 decision tree. Future endpoints that surface
camera lists for an org-scoped caller MUST also follow §2 unless they document an
explicit override in their own contract.

## 4. Permify check failure

If the Permify "organization:manage" check returns an error (network down, Permify
unavailable, malformed tuple data), the service path MUST:

- Propagate the error up the call stack.
- Return HTTP `502 Bad Gateway` with code `PERMIFY_UNAVAILABLE` (or the equivalent
  domain-mapped error already in use).

It MUST NOT silently treat the caller as org-admin (security regression risk) and
MUST NOT silently treat them as a non-admin (would resurrect Bug #2).

## 5. Tuple authority

This contract reads only existing Permify tuples. It does not introduce new tuple
shapes. The relevant existing tuples are:

| Tuple | Written by | Used by §2 |
|---|---|---|
| `organization:{orgId}#manage@user:{userId}` | org-admin grant flow | yes — the "org-admin" branch |
| `camera:{camId}#viewer@user:{userId}` (via resource-group expansion) | resource-group membership flow | yes — the "regular member" branch |
| `camera:{camId}#parentOrg@organization:{orgId}` | `CameraService.Create` | indirect — via "all cameras in orgId" repo filter |

## 6. Compatibility

- **Backward compatibility:** breaking for non-admin members who currently see no
  cameras and could not have created the cameras themselves — they continue to see
  none. **Additive** for org-admins who previously saw a strict subset; they now
  see the union. No callers should regress.
- **Replay:** not applicable.
- **Re-sync:** not applicable; no data writes.

## 7. Field ownership

This contract does not write any fields. It governs **read** visibility only.

## 8. Revision history

- **rev 1 (2026-04-27):** initial — aligns CCTV list to Map's existing org-admin
  branch. Bug #2.

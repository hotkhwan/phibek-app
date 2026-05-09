# Floor Plan 2D Import + Camera Placement + AI 3D Digital Twin Contract

**Date:** 2026-04-24
**Status:** Draft v2 (revised after Codex review 2026-04-24)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/floorPlanDigitalTwin.md](../plan/floorPlanDigitalTwin.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v1

---

## 0. Revision Log

- **v2.1 (2026-04-24):** Additive — optional outdoor georeference (`lat`, `lng`) on the floor plan itself. Accepted on `POST` (multipart), `PATCH` (JSON body). Returned in `FloorPlanDetail` / `FloorPlanListItem` as nullable numbers. Range-checked (`lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`). Purely additive — consumers that ignore the fields keep working unchanged.
- **v2 (2026-04-24):** Addressed Codex review —
  1. §5.12 Suggest: removed pixel seed and `suggestedXPx/yPx`; seed restricted to a **placed** `seedCamId`; signals reduced to geo + groups + site/zone (affinity ranking only).
  2. Added §3A auth matrix tied to real Permify schema; Phase 1 uses `organization.view` / `organization.manage` (no schema.perm change).
  3. Removed provider-shaped fields: no `provider` in request, no `options.style`; request body is `{}`. Response hides provider identifier from FE.
  4. PATCH/DELETE on floor plans and placements now require `expectedRevision`; added `409 REVISION_CONFLICT`. §5.14 twin-status endpoint is explicitly **read-only**; provider polling + asset upload are performed by a background worker (documented).

---

## 1. Purpose

Publish the full REST surface for the floor-plan → placement → digital-twin workflow so that `klynx-feature` implements against a stable contract. `klynx-api` is the owner; all request/response/error shapes in this document are authoritative. FE must not infer types from implementation.

---

## 2. Ownership

### Owner Backend

`klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Floor-plan metadata | `klynx-api` | `floor_plans` | canonical, Klynx-only |
| Floor-plan image | `klynx-api` | S3 `floorPlans/image/{planId}.{ext}` | private bucket by default |
| Camera placement | `klynx-api` | `floor_plan_camera_placements` | canonical, Klynx-only |
| Digital-twin job | `klynx-api` | `floor_plan_twin_jobs` | canonical, Klynx-only |
| Twin assets (`.glb`, thumb) | `klynx-api` S3 | `floorPlans/twin/{planId}/{jobId}.*` | re-hosted from AI provider |
| Camera identity | `gateway-api/device_management` | — | read-only reference via `camId` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST /floorPlans` | `klynx-feature` | `klynx-api/mapapi` (new sub-package `floorplanapi`) | multipart upload |
| `POST /floorPlans/:id/placements/suggest` | `klynx-feature` | `klynx-api/floorplansvc` | pure read; no side effects |
| `POST /floorPlans/:id/twin` | `klynx-feature` | `klynx-api/floorplansvc` → `aigenerationgw` | async; returns `jobId` |
| `GET /floorPlans/:id/twin/:jobId` | `klynx-feature` (polling) | `klynx-api/floorplansvc` | returns status + result when ready |

### Projection Stores

None in Phase 1.

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive** — entirely new surface.
- Consumer requirements: `klynx-feature` must target v1.
- Deprecation window: n/a.

### Replay / Re-sync Behavior

- Not applicable (no Kafka in Phase 1).
- Polling is idempotent: repeated `GET /floorPlans/:id/twin/:jobId` returns the same body until status transitions.

### Write Authority Policy

- `klynx-api` is the authoritative writer for every resource in this contract.
- `gateway-api/device_management` remains the source of truth for cameras; this contract references cameras by `camId` only.
- FE must never mutate camera identity through this contract.

---

## 3A. Authorization Matrix

Every endpoint below assumes `AuthBearer()` + `ActiveOrg()` middleware has validated the JWT and set the locals `userId`, `tenantId`, `activeOrg`. On top of that, each handler performs a Permify `CheckPermission` call against the **existing** schema (no schema.perm change in Phase 1):

| Endpoint | Entity | Permission | Notes |
|---|---|---|---|
| `POST /floorPlans` | `organization:{activeOrg}` | `manage` | owner/admin only |
| `GET /floorPlans` | `organization:{activeOrg}` | `view` | any member |
| `GET /floorPlans/:id` | `organization:{activeOrg}` | `view` | any member |
| `PATCH /floorPlans/:id` | `organization:{activeOrg}` | `manage` | |
| `DELETE /floorPlans/:id` | `organization:{activeOrg}` | `manage` | |
| `DELETE /floorPlans/bulk` | `organization:{activeOrg}` | `manage` | |
| `GET /floorPlans/:id/placements` | `organization:{activeOrg}` | `view` | |
| `POST /floorPlans/:id/placements` | `organization:{activeOrg}` | `manage` | |
| `PATCH /floorPlans/:id/placements/:placementId` | `organization:{activeOrg}` | `manage` | |
| `DELETE /floorPlans/:id/placements/:placementId` | `organization:{activeOrg}` | `manage` | |
| `POST /floorPlans/:id/placements/bulk` | `organization:{activeOrg}` | `manage` | |
| `POST /floorPlans/:id/placements/suggest` | `organization:{activeOrg}` | `view` | pure read |
| `POST /floorPlans/:id/twin` | `organization:{activeOrg}` | `manage` | queues worker job |
| `GET /floorPlans/:id/twin/:jobId` | `organization:{activeOrg}` | `view` | read-only status |

**Implementation pattern:**

```go
// either in a shared middleware helper:
func RequireOrgPermission(perm string) fiber.Handler {
    return func(c fiber.Ctx) error {
        orgId := c.Locals("activeOrg").(string)
        userId := c.Locals("userId").(string)
        tenantId := c.Locals("tenantId").(string)
        allowed, err := authzClient.CheckPermissionWithSchemaVersion(
            c.Context(), tenantId, config.CurrentSchemaVersion,
            "organization", orgId, perm, "user", userId,
        )
        if err != nil { return httputil.InternalError(c, err) }
        if !allowed   { return httputil.Forbidden(c, "FORBIDDEN", "insufficient permission") }
        return c.Next()
    }
}

// wired at route registration:
r.Post("/floorPlans", middleware.RequireOrgPermission("manage"), floorplanapi.Create)
r.Get ("/floorPlans", middleware.RequireOrgPermission("view"),   floorplanapi.List)
```

### Phase 2 Migration (non-breaking for FE)

A follow-up plan introduces a dedicated `floorPlan` Permify entity with `view`, `edit`, `delete` permissions (modeled after `camera`). The Permify check changes from `organization:{orgId}#view/manage` → `floorPlan:{id}#view/edit/delete`; the REST surface and error codes stay identical. FE sees no behavior change during migration.

### FE Gating

- **Read menu visibility:** FE checks whether `floor-plans-menu` is in `effectiveAccess.visibleMenuIds` before rendering the sidebar entry. Entry is seeded with `visibilityType=baseline` so all org members see it.
- **Write actions:** FE gates "Upload", "Edit", "Delete", "Place camera", and "Generate 3D" buttons on `effectiveAccess.orgCapabilities.canManageOrganization === true`. That value already tracks `organization.manage`.
- **Do not try to mirror per-resource permission logic on the client.** Backend is the sole authority; FE may still see a 403 on a write attempt and must surface it gracefully.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/floorPlans` | `POST` (multipart) | Bearer + X-Active-Org | `floorplanapi.Create` | `klynx-feature` |
| REST | `/floorPlans` | `GET` | Bearer + X-Active-Org | `floorplanapi.List` | `klynx-feature` |
| REST | `/floorPlans/:id` | `GET` | Bearer + X-Active-Org | `floorplanapi.Get` | `klynx-feature` |
| REST | `/floorPlans/:id` | `PATCH` | Bearer + X-Active-Org | `floorplanapi.Update` | `klynx-feature` |
| REST | `/floorPlans/:id` | `DELETE` | Bearer + X-Active-Org | `floorplanapi.Delete` | `klynx-feature` |
| REST | `/floorPlans/bulk` | `DELETE` | Bearer + X-Active-Org | `floorplanapi.BulkDelete` | `klynx-feature` |
| REST | `/floorPlans/:id/placements` | `GET` | Bearer + X-Active-Org | `floorplanapi.ListPlacements` | `klynx-feature` |
| REST | `/floorPlans/:id/placements` | `POST` | Bearer + X-Active-Org | `floorplanapi.AddPlacement` | `klynx-feature` |
| REST | `/floorPlans/:id/placements/:placementId` | `PATCH` | Bearer + X-Active-Org | `floorplanapi.UpdatePlacement` | `klynx-feature` |
| REST | `/floorPlans/:id/placements/:placementId` | `DELETE` | Bearer + X-Active-Org | `floorplanapi.RemovePlacement` | `klynx-feature` |
| REST | `/floorPlans/:id/placements/bulk` | `POST` | Bearer + X-Active-Org | `floorplanapi.BulkAddPlacements` | `klynx-feature` |
| REST | `/floorPlans/:id/placements/suggest` | `POST` | Bearer + X-Active-Org | `floorplanapi.SuggestPlacements` | `klynx-feature` |
| REST | `/floorPlans/:id/twin` | `POST` | Bearer + X-Active-Org | `floorplanapi.StartTwin` | `klynx-feature` |
| REST | `/floorPlans/:id/twin/:jobId` | `GET` | Bearer + X-Active-Org | `floorplanapi.TwinStatus` | `klynx-feature` |

---

## 5. REST Contract

### 5.1 Create Floor Plan

**Endpoint:** `/floorPlans`
**Method:** `POST`
**Auth:** `AuthBearer + ActiveOrg`
**Purpose:** Upload a 2D floor-plan image (PNG/JPG) with metadata. Server stores the image in S3 and the metadata in `floor_plans`.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | active org id |
| `Content-Type` | yes | `multipart/form-data` |

#### Request Body (multipart form)

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | yes | PNG or JPG, ≤ 15 MB, ≥ 256×256 px |
| `name` | string | yes | display name, 1–120 chars, unique per org among non-deleted |
| `buildingName` | string | no | free-form building label |
| `floorLabel` | string | no | free-form floor label (e.g. `"2F"`, `"Basement"`) |
| `scaleMetersPerPx` | float | yes | real-world meters per image pixel; `> 0` |
| `description` | string | no | ≤ 500 chars |

#### Success Response

**HTTP:** `201`

```json
{
  "code": "SUCCESS",
  "message": "Floor plan created",
  "status": true,
  "details": {
    "id": "fp_01HX7K2N4ABC123",
    "name": "Main building — 2F",
    "buildingName": "HQ Building A",
    "floorLabel": "2F",
    "description": "Second floor after 2026 renovation",
    "imageUrl": "https://s3.klynx.internal/floorPlans/image/fp_01HX7K2N4ABC123.png",
    "imageWidthPx": 2048,
    "imageHeightPx": 1536,
    "scaleMetersPerPx": 0.025,
    "placementCount": 0,
    "latestTwinJobId": null,
    "revision": 1,
    "createAt": "2026-04-24T09:12:33Z",
    "updateAt": "2026-04-24T09:12:33Z"
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `id` | string | floor-plan id (ULID prefixed `fp_`) |
| `imageUrl` | string | presigned (7-day) URL for the stored image |
| `imageWidthPx` | int | decoded image width |
| `imageHeightPx` | int | decoded image height |
| `scaleMetersPerPx` | float | as provided |
| `placementCount` | int | number of non-deleted placements; `0` at creation |
| `latestTwinJobId` | string\|null | `null` until a twin job is started |
| `revision` | int | monotonic revision counter |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `INVALID_IMAGE` | not PNG/JPG, corrupt, or < 256×256 | surface file error |
| 400 | `SCALE_REQUIRED` | `scaleMetersPerPx` missing or `≤ 0` | require user to set scale |
| 400 | `INVALID_PAYLOAD` | missing/invalid fields | show validation errors |
| 401 | `UNAUTHORIZED` | auth missing/invalid | login flow |
| 403 | `FORBIDDEN` | no org membership / permission | hide UI entry |
| 409 | `DUPLICATE_NAME` | another plan with same `name` exists | ask user to rename |
| 413 | `PAYLOAD_TOO_LARGE` | image > 15 MB | reject before upload |
| 500 | `INTERNAL_ERROR` | unexpected | retry/toast |

---

### 5.2 List Floor Plans

**Endpoint:** `/floorPlans`
**Method:** `GET`
**Auth:** `AuthBearer + ActiveOrg`
**Purpose:** Paginated list of floor plans for the active org.

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | int | no | `1` | 1-based |
| `perPage` | int | no | `20` | max `100` |
| `q` | string | no | — | case-insensitive substring on `name` / `buildingName` |
| `buildingName` | string | no | — | exact match filter |
| `sortField` | string | no | `createAt` | one of `createAt`, `updateAt`, `name` |
| `sortOrder` | string | no | `desc` | `asc` \| `desc` |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "OK",
  "status": true,
  "details": {
    "items": [
      {
        "id": "fp_01HX7K2N4ABC123",
        "name": "Main building — 2F",
        "buildingName": "HQ Building A",
        "floorLabel": "2F",
        "imageUrl": "https://s3.klynx.internal/...",
        "placementCount": 12,
        "latestTwinJobId": "tj_01HX...",
        "latestTwinStatus": "succeeded",
        "updateAt": "2026-04-24T09:12:33Z"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "perPage": 20,
    "totalRecords": 1,
    "totalPages": 1,
    "sortField": "createAt",
    "sortOrder": "desc"
  }
}
```

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | bad paging/sort params |
| 401 | `UNAUTHORIZED` | — |
| 403 | `FORBIDDEN` | — |

---

### 5.3 Get Floor Plan Detail

**Endpoint:** `/floorPlans/:id`
**Method:** `GET`
**Auth:** `AuthBearer + ActiveOrg`
**Purpose:** Full floor-plan detail (same shape as Create response).

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | floor-plan id |

#### Success Response

`200` — `FloorPlanDetail` (same shape as §5.1 Success).

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 404 | `NOT_FOUND` | no such plan in this org |

---

### 5.4 Update Floor Plan

**Endpoint:** `/floorPlans/:id`
**Method:** `PATCH`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.manage`
**Purpose:** Update mutable metadata. Image replacement is **not** in this endpoint — delete + create to replace.

#### Request Body

```json
{
  "expectedRevision": 3,
  "name": "Main building — 2F v2",
  "buildingName": "HQ Building A",
  "floorLabel": "2F",
  "description": "Updated post-renovation",
  "scaleMetersPerPx": 0.024
}
```

#### Request Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `expectedRevision` | int | **yes** | klynx-api | current `revision` from a recent `GET`; server rejects if stale |
| `name` | string\|null | no | klynx-api | pointer semantics: present → set; omitted → unchanged |
| `buildingName` | string\|null | no | klynx-api | same |
| `floorLabel` | string\|null | no | klynx-api | same |
| `description` | string\|null | no | klynx-api | same |
| `scaleMetersPerPx` | float\|null | no | klynx-api | must be `> 0` when present |

The server uses atomic `findOneAndUpdate({_id, revision: expectedRevision})` and increments `revision` by 1 on success. On mismatch, the response includes the current revision so the client can refetch and retry.

#### Success Response

`200` — `FloorPlanDetail` (with `revision = expectedRevision + 1`).

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | bad field shape; includes missing `expectedRevision` |
| 404 | `NOT_FOUND` | — |
| 409 | `DUPLICATE_NAME` | conflict |
| 409 | `REVISION_CONFLICT` | `expectedRevision` does not match current; body contains `{currentRevision}` |

---

### 5.5 Delete Floor Plan

**Endpoint:** `/floorPlans/:id`
**Method:** `DELETE`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.manage`
**Purpose:** Soft-delete the plan and its placements. Blocked while a twin job is non-terminal.

#### Request Body

```json
{ "expectedRevision": 3 }
```

| Field | Type | Required | Description |
|---|---|---|---|
| `expectedRevision` | int | **yes** | current `revision`; mismatch → `409 REVISION_CONFLICT` |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "Floor plan deleted",
  "status": true,
  "details": null
}
```

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | missing `expectedRevision` |
| 404 | `NOT_FOUND` | — |
| 409 | `TWIN_IN_PROGRESS` | non-terminal twin job exists; FE must wait or cancel twin |
| 409 | `REVISION_CONFLICT` | — |

---

### 5.6 Bulk Delete Floor Plans

**Endpoint:** `/floorPlans/bulk`
**Method:** `DELETE`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.manage`

#### Request Body

```json
{
  "items": [
    { "id": "fp_01HX...", "expectedRevision": 2 },
    { "id": "fp_01HY...", "expectedRevision": 5 }
  ]
}
```

#### Request Field Definitions

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array | yes | 1–100 items |
| `items[].id` | string | yes | floor-plan id |
| `items[].expectedRevision` | int | yes | current revision of that plan |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "Bulk delete completed",
  "status": true,
  "details": {
    "items": [
      { "id": "fp_01HX...", "status": "deleted" },
      { "id": "fp_01HY...", "status": "error", "code": "TWIN_IN_PROGRESS" },
      { "id": "fp_01HZ...", "status": "error", "code": "REVISION_CONFLICT", "currentRevision": 7 }
    ]
  }
}
```

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | empty `items` or missing `expectedRevision` on any item |
| 422 | `BULK_LIMIT` | > 100 items |

Per-item failures are reported inline with `status: "error"` and a `code`. Top-level response is `200` when the request was syntactically valid.

---

### 5.7 List Placements

**Endpoint:** `/floorPlans/:id/placements`
**Method:** `GET`
**Auth:** `AuthBearer + ActiveOrg`

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "OK",
  "status": true,
  "details": {
    "items": [
      {
        "id": "pl_01HX7K3M...",
        "floorPlanId": "fp_01HX7K2N4ABC123",
        "camId": "4c2e3a10-8b3a-4b7f-9a21-2fbb1ea9b901",
        "cameraName": "Lobby - Entrance",
        "cameraStatus": true,
        "xPx": 512,
        "yPx": 340,
        "rotationDeg": 0,
        "revision": 1,
        "createAt": "2026-04-24T09:14:00Z",
        "updateAt": "2026-04-24T09:14:00Z",
        "cameraAvailability": "available"
      }
    ]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | placement id (ULID prefixed `pl_`) |
| `camId` | string | camera UUID |
| `cameraName` | string | denormalized; source of truth is `gateway-api` |
| `cameraAvailability` | string | `available` \| `unavailable` — `unavailable` means the camera no longer exists in this org; FE should render a stale chip |
| `xPx`, `yPx` | number | pixel coords on the floor-plan image (top-left origin) |
| `rotationDeg` | number | `0–359`; orientation of the camera marker |

---

### 5.8 Add Placement

**Endpoint:** `/floorPlans/:id/placements`
**Method:** `POST`
**Auth:** `AuthBearer + ActiveOrg`

#### Request Body

```json
{
  "camId": "4c2e3a10-8b3a-4b7f-9a21-2fbb1ea9b901",
  "xPx": 512,
  "yPx": 340,
  "rotationDeg": 0
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `camId` | string | yes | must exist in this org |
| `xPx` | number | yes | `0 ≤ xPx ≤ imageWidthPx` |
| `yPx` | number | yes | `0 ≤ yPx ≤ imageHeightPx` |
| `rotationDeg` | number | no | default `0`; `[0, 360)` |

#### Success Response

`201` — `PlacementItem` (same shape as §5.7 items).

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `OUT_OF_BOUNDS` | `xPx`/`yPx` outside image |
| 400 | `INVALID_PAYLOAD` | missing fields |
| 404 | `CAMERA_NOT_FOUND` | `camId` not in this org |
| 404 | `NOT_FOUND` | floor-plan id |
| 409 | `ALREADY_PLACED` | placement already exists for `(plan, camId)` |

---

### 5.9 Update Placement

**Endpoint:** `/floorPlans/:id/placements/:placementId`
**Method:** `PATCH`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.manage`

#### Request Body (pointer semantics, with required `expectedRevision`)

```json
{ "expectedRevision": 1, "xPx": 520, "yPx": 355, "rotationDeg": 45 }
```

| Field | Type | Required | Description |
|---|---|---|---|
| `expectedRevision` | int | **yes** | current placement revision |
| `xPx` | number\|null | no | in-bounds when present |
| `yPx` | number\|null | no | in-bounds when present |
| `rotationDeg` | number\|null | no | `[0, 360)` when present |

#### Success Response

`200` — `PlacementItem` (with `revision = expectedRevision + 1`).

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | missing `expectedRevision` |
| 400 | `OUT_OF_BOUNDS` | — |
| 404 | `NOT_FOUND` | placement or plan missing |
| 409 | `REVISION_CONFLICT` | body contains `{currentRevision}` |

---

### 5.10 Remove Placement

**Endpoint:** `/floorPlans/:id/placements/:placementId`
**Method:** `DELETE`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.manage`

#### Request Body

```json
{ "expectedRevision": 1 }
```

#### Success Response

`200` `MessageOK`.

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | missing `expectedRevision` |
| 404 | `NOT_FOUND` | — |
| 409 | `REVISION_CONFLICT` | — |

---

### 5.11 Bulk Add Placements

**Endpoint:** `/floorPlans/:id/placements/bulk`
**Method:** `POST`
**Auth:** `AuthBearer + ActiveOrg`
**Purpose:** Confirm a set of suggestions in one request.

#### Request Body

```json
{
  "items": [
    { "camId": "uuid-a", "xPx": 500, "yPx": 320, "rotationDeg": 0 },
    { "camId": "uuid-b", "xPx": 540, "yPx": 360 }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | array | yes | 1–100 items |
| `items[].camId` | string | yes | must exist in this org |
| `items[].xPx` | number | yes | in-bounds |
| `items[].yPx` | number | yes | in-bounds |
| `items[].rotationDeg` | number | no | default `0` |

#### Success Response

`200` partial-success envelope:

```json
{
  "code": "SUCCESS",
  "message": "Bulk add completed",
  "status": true,
  "details": {
    "items": [
      { "camId": "uuid-a", "status": "placed", "placementId": "pl_..." },
      { "camId": "uuid-b", "status": "error", "code": "ALREADY_PLACED" }
    ]
  }
}
```

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | — |
| 422 | `BULK_LIMIT` | > 100 items |

---

### 5.12 Suggest Placements

**Endpoint:** `/floorPlans/:id/placements/suggest`
**Method:** `POST`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.view`
**Purpose:** Given an **already-placed** camera as seed, return candidate cameras from the same org ranked by **affinity** — how likely they belong to the same building/floor as the seed. The response is a ranking only; the server does **not** infer indoor pixel coordinates for unplaced cameras. FE is responsible for positioning each accepted candidate on the canvas before persisting it via `POST /placements`.

#### Why placement seed only

Unplaced cameras have no authoritative indoor coordinate. A pixel seed (`seedXPx/seedYPx`) would only be useful if the server could compare plan-distance between unplaced cameras — which it cannot. Affinity is computed from outdoor geodata plus shared device-group / site-zone metadata; that signal applies regardless of where on the plan the seed is drawn, so only a placed seed is meaningful.

#### Request Body

```json
{
  "seedCamId": "4c2e3a10-8b3a-4b7f-9a21-2fbb1ea9b901",
  "limit": 8,
  "radiusMeters": 25
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `seedCamId` | string | **yes** | — | must already be placed on this floor plan |
| `limit` | int | no | `8` | max `50` |
| `radiusMeters` | number | no | `25` | soft radius for geo-distance signal; candidates beyond are still scored but downranked |

#### Candidate Set

Candidates are cameras in the same org that are **not yet placed on this floor plan**. Cameras placed on other plans are still eligible (one camera may appear on multiple plans).

#### Scoring Signals

```
score = w1 * inverseGeoDistanceMeters   (only when BOTH seed and candidate have lat/lng)
      + w2 * sharedGroupBoost           (+1 per shared device group)
      + w3 * sharedSiteZoneBoost        (+1 for matching siteName, +1 for matching zoneName)
```

- Weights `w1..w3` live in `configruntime` under `floorplan.suggest.*` and are tunable without redeploy.
- If a candidate has none of the signals (no geo, no shared group, no shared site/zone), it is omitted entirely rather than ranked at zero.
- **No `planDistanceMeters` signal** — it is not computable for unplaced candidates.
- **No server-proposed pixel coordinates** — FE drives positioning.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "OK",
  "status": true,
  "details": {
    "items": [
      {
        "camId": "uuid-b",
        "cameraName": "Lobby - Reception",
        "cameraStatus": true,
        "score": 0.91,
        "signals": {
          "geoDistanceMeters": 4.2,
          "sharedGroups": ["lobby"],
          "sharedSiteZone": { "siteMatch": true, "zoneMatch": false }
        }
      }
    ],
    "seed": {
      "camId": "4c2e3a10-8b3a-4b7f-9a21-2fbb1ea9b901",
      "placementId": "pl_01HX7K3M..."
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `score` | float | `0..1`; higher = stronger recommendation |
| `signals.geoDistanceMeters` | float\|null | null when either side lacks lat/lng |
| `signals.sharedGroups` | string[] | empty array when none |
| `signals.sharedSiteZone` | object\|null | null when no site/zone metadata available |
| `seed.camId` / `seed.placementId` | string | echo of the seed for FE UI binding |

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | missing `seedCamId`, or bad limit/radius |
| 404 | `NOT_FOUND` | plan missing |
| 404 | `SEED_CAMERA_NOT_PLACED` | `seedCamId` is not placed on this plan |

---

### 5.13 Start Digital-Twin Job

**Endpoint:** `/floorPlans/:id/twin`
**Method:** `POST`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.manage`
**Purpose:** Queue an asynchronous digital-twin job for this floor plan and its current placements. Returns a `jobId` immediately; a background worker submits to the AI provider and advances the state machine. No provider-shaped options are accepted in v1 — the server chooses the provider and all generation parameters.

#### Request Body

```json
{}
```

In v1 the request body is an **empty JSON object**. No fields are accepted. Any additional field is ignored (forward-compat); the server may reject unknown fields with `400 INVALID_PAYLOAD` once v2 introduces knobs.

#### Success Response

**HTTP:** `202`

```json
{
  "code": "SUCCESS",
  "message": "Twin job queued",
  "status": true,
  "details": {
    "jobId": "tj_01HX8M2PQRS",
    "floorPlanId": "fp_01HX7K2N4ABC123",
    "status": "queued",
    "queuedAt": "2026-04-24T09:30:00Z",
    "placementsSnapshot": 12,
    "placementsHash": "sha256:..."
  }
}
```

| Field | Type | Description |
|---|---|---|
| `jobId` | string | `tj_` ULID |
| `status` | string | one of `queued`, `running`, `succeeded`, `failed`, `canceled` |
| `placementsSnapshot` | int | number of placements included |
| `placementsHash` | string | fingerprint for idempotency (`sha256` over canonicalized placement tuples) |

The response does **not** include a provider identifier. Provider identity is an internal detail of the worker; FE must never branch on it.

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 404 | `NOT_FOUND` | floor plan |
| 409 | `TWIN_IN_PROGRESS` | an existing job for same `(plan, placementsHash)` is still non-terminal — response body contains the existing `jobId` |
| 422 | `NO_PLACEMENTS` | plan has zero placements |
| 503 | `TWIN_WORKER_UNAVAILABLE` | twin generation is not enabled in this deployment (`FLOOR_PLAN_TWIN_WORKER_ENABLED=false`). Returned **before** any DB write or provider call, so no orphan job is queued. FE should hide the "Generate 3D" button for this deployment and/or show a permanent disabled-state banner |
| 503 | `AI_UNAVAILABLE` | worker is enabled but the AI gateway is not configured (`AI_GENERATION_URL` unset). Usually means an operator forgot a secret — FE shows "AI 3D generation is not configured; contact your administrator" |

The two 503 codes are deliberately distinct. `TWIN_WORKER_UNAVAILABLE` is a product-level signal (feature not offered in this deployment profile) and may be permanent for the deployment's lifetime; `AI_UNAVAILABLE` is an operational signal (configuration missing) and should resolve once the operator sets the env. FE copy and behavior differ.

---

### 5.14 Get Digital-Twin Job Status

**Endpoint:** `/floorPlans/:id/twin/:jobId`
**Method:** `GET`
**Auth:** `AuthBearer + ActiveOrg` + Permify `organization.view`
**Purpose:** Return the current persisted state of a twin job. This endpoint is **strictly read-only** — it does not call the AI provider, does not upload to S3, and does not mutate the job record in any way. Multiple FE tabs polling concurrently is safe and idempotent.

Job advancement (queued → running → succeeded/failed) is owned by the `floorplantwinworker` background worker. The worker holds a Mongo lease (`leasedBy`, `leasedUntil`) during provider I/O and asset upload; only the lease holder writes status and result.

**Coupling with submit:** the same `FLOOR_PLAN_TWIN_WORKER_ENABLED` flag controls both the worker loop and the `POST /twin` submit endpoint. When the flag is `false`, new jobs cannot be accepted (§5.13 returns `503 TWIN_WORKER_UNAVAILABLE`), so there is no scenario in which this status endpoint observes a job that no worker will ever advance. Pre-existing non-terminal jobs from a previous enabled state remain visible and frozen at their last persisted status — operators must resolve them manually (Phase 1 has no admin cancel endpoint; Phase 2 will add one).

**FE polling cadence recommendation:** 5 s for the first 30 s, then 15 s, stop on terminal status.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "OK",
  "status": true,
  "details": {
    "jobId": "tj_01HX8M2PQRS",
    "floorPlanId": "fp_01HX7K2N4ABC123",
    "status": "succeeded",
    "progressPercent": 100,
    "queuedAt": "2026-04-24T09:30:00Z",
    "startedAt": "2026-04-24T09:30:05Z",
    "finishedAt": "2026-04-24T09:33:41Z",
    "modelUrl": "https://s3.klynx.internal/floorPlans/twin/fp_01HX7K2N4ABC123/tj_01HX8M2PQRS.glb",
    "thumbnailUrl": "https://s3.klynx.internal/floorPlans/twin/fp_01HX7K2N4ABC123/tj_01HX8M2PQRS.thumb.webp",
    "placements3D": [
      {
        "camId": "uuid-a",
        "position": { "x": 5.2, "y": 2.4, "z": 8.1 },
        "rotationDeg": 0
      }
    ],
    "errorCode": null,
    "errorMessage": null
  }
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | `queued` \| `running` \| `succeeded` \| `failed` \| `canceled` |
| `progressPercent` | int | `0–100`; best-effort, written by worker |
| `modelUrl` | string\|null | presigned `.glb` URL — only when `status == "succeeded"` |
| `thumbnailUrl` | string\|null | presigned thumbnail — only when `status == "succeeded"` |
| `placements3D` | array\|null | camera positions in 3D scene coords (meters); only when succeeded |
| `placements3D[].position` | `{x,y,z}` | meters; `y` = up |
| `errorCode` | string\|null | present when `status == "failed"`; one of `PROVIDER_ERROR`, `TIMEOUT`, `INVALID_OUTPUT`, `UPLOAD_FAILED` |
| `errorMessage` | string\|null | human-readable |

The response deliberately **does not include a provider identifier**. Provider identity is a worker-internal detail; FE must not branch on it.

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 404 | `NOT_FOUND` | unknown `jobId` or not owned by this org |

---

## 6. Event Contract

Not applicable in Phase 1. A future event `klynx.floorPlan.twin.completed.v1` may be introduced when the polling path is replaced by a callback — out of scope for this contract version.

---

## 7. Error Code Catalog

| Code | HTTP | Surface | Notes |
|---|---|---|---|
| `INVALID_PAYLOAD` | 400 | all | generic validation failure (incl. missing `expectedRevision` or missing `seedCamId`) |
| `INVALID_IMAGE` | 400 | 5.1 | bad file format/dimensions |
| `SCALE_REQUIRED` | 400 | 5.1, 5.4 | `scaleMetersPerPx` missing or non-positive |
| `OUT_OF_BOUNDS` | 400 | 5.8, 5.9, 5.11 | placement pixel coords outside image |
| `UNAUTHORIZED` | 401 | all | missing/invalid JWT |
| `FORBIDDEN` | 403 | all | Permify check failed (org membership or `view`/`manage`) |
| `NOT_FOUND` | 404 | all | plan/placement/job missing |
| `CAMERA_NOT_FOUND` | 404 | 5.8, 5.11 | `camId` not in this org |
| `SEED_CAMERA_NOT_PLACED` | 404 | 5.12 | `seedCamId` not placed on this plan |
| `DUPLICATE_NAME` | 409 | 5.1, 5.4 | another plan with same name |
| `ALREADY_PLACED` | 409 | 5.8, 5.11 | `(plan, camId)` already placed |
| `REVISION_CONFLICT` | 409 | 5.4, 5.5, 5.6, 5.9, 5.10 | `expectedRevision` stale; body includes `currentRevision` |
| `TWIN_IN_PROGRESS` | 409 | 5.5, 5.6, 5.13 | non-terminal twin job |
| `PAYLOAD_TOO_LARGE` | 413 | 5.1 | image > 15 MB |
| `BULK_LIMIT` | 422 | 5.6, 5.11 | more than 100 items |
| `NO_PLACEMENTS` | 422 | 5.13 | twin requested on empty plan |
| `TWIN_WORKER_UNAVAILABLE` | 503 | 5.13 | deployment has `FLOOR_PLAN_TWIN_WORKER_ENABLED=false`; feature not offered here (product-level) |
| `AI_UNAVAILABLE` | 503 | 5.13 | worker enabled but AI gateway env unset (operational) |
| `INTERNAL_ERROR` | 500 | all | unexpected server error |

#### `REVISION_CONFLICT` error body

```json
{
  "code": "REVISION_CONFLICT",
  "message": "Resource was modified since you loaded it; please refetch and retry.",
  "currentRevision": 7
}
```

FE handling: refetch the resource, reapply the user's change over the latest state, and re-submit. Do **not** silently retry with the new revision — that re-introduces the silent-overwrite problem this precondition is meant to prevent.

---

## 8. Consumer Implementation Notes (FE)

- Upload: use `multipart/form-data`; do **not** base64-encode the image.
- **Revision tracking:** store `revision` from every `GET` response on both plans and placements. On every PATCH/DELETE send it back as `expectedRevision`. On `409 REVISION_CONFLICT`, refetch, reapply the user's intent over the new state, show a conflict banner, and require an explicit retry — **do not silently auto-retry with the new revision**.
- **Suggestion flow:** `POST /placements/suggest` returns a ranked list only; there are no server-proposed pixel coordinates. Present the list in a side panel, let the user drag each accepted candidate onto the canvas, then persist via `POST /placements` (one-by-one) or `POST /placements/bulk` (batch confirm). The seed must already be placed — FE should only expose the suggest action after the first placement succeeds.
- Bulk endpoints return partial success — render per-item statuses, do not fail the batch on a single `ALREADY_PLACED` or `REVISION_CONFLICT`.
- **Twin polling:** treat `GET /twin/:jobId` as read-only and stateless. Use 5 s interval for the first 30 s, then 15 s, stopping on terminal status. Multiple open tabs polling the same job is safe.
- Fetch `modelUrl` into `<model-viewer src="...">`; the URL is presigned for 7 days. If the user keeps a tab open longer, re-fetch the job to get a fresh URL.
- Two distinct 503s on `POST /twin`:
  - `TWIN_WORKER_UNAVAILABLE` — permanent for this deployment (product-level gate). Hide or permanently disable the "Generate 3D" button. Safe to cache the result in a feature-flag composable after the first 503.
  - `AI_UNAVAILABLE` — operational (missing config). Show "AI 3D generation is not configured; contact your administrator" and allow retry.
- **Permission gating:**
  - Sidebar menu: show the "Floor Plans" entry only when `floor-plans-menu` ∈ `effectiveAccess.visibleMenuIds`.
  - Write-action buttons (Upload / Edit / Delete / Place / Generate 3D): enable only when `effectiveAccess.orgCapabilities.canManageOrganization === true`.
  - If the backend returns `403 FORBIDDEN` anyway (e.g., FE flags drifted from Permify state), show a permission-denied toast and refetch effective access.
- All timestamps are RFC3339 UTC.
- Envelope: always read from `details` (never `detail`); paginated lists have top-level `pagination`.

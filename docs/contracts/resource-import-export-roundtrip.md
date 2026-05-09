# Resource Import / Export Round-Trip — Contract

**Date:** 2026-05-01
**Status:** Superseded by [`resource-group.md`](./resource-group.md) on 2026-05-04 — RG/camera round-trip + RG hierarchy + RG custom icons merged into one ResourceGroup lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All Phase E1-E3 behavior preserved verbatim in §5.6 of the merged contract: 3 endpoints (export/template/import), full sheet schemas (Cameras + ResourceGroups header tables with all column aliases), three-state `parentGroupId` round-trip semantics, idempotent unchanged outcome (field-level diff + tuple-set diff), `success`-vs-`permifySyncFailed[]` separation, migration mode double-gate (env + form + UUIDv4 + rate limit + audit log), all 9 camera per-row error codes + 9 group per-row error codes, all 7 top-level errors, v1→v2 IP-reject → IP-warn semantic change, and the gw-managed read-only enforcement (`CAMERA_GW_MANAGED`). The Permify tuple delta rules are now under §9.2 + §9.5. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/done/resource-import-export-roundtrip.md](../plan/done/resource-import-export-roundtrip.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v2 (supersedes camera-import-canonical v1 import semantics; v1 export had no surface)
**Supersedes (in part):** [camera-import-canonical.md](camera-import-canonical.md) — `Cameras` sheet shape preserved; per-row outcome semantics extended

---

## 1. Purpose

สัญญานี้นิยามรูปแบบ round-trip ของ camera + resourceGroup ผ่าน Excel:

- `klynx-api` เป็นเจ้าของ endpoint export / template / import (ขยายจากของเดิม) และเป็นผู้เขียน projection ทั้ง `klynx.camera` และ `klynx.resource_groups`
- `klynx-feature` consume contract นี้โดยตรง — ห้ามเดา column / ห้ามเดา outcome code / ห้ามเดา migration-mode behavior
- Round-trip key คือ **id** (camera = `camId`, resourceGroup = `groupId`); `ip` ลดบทบาทเป็น secondary warning

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Klynx camera projection | `klynx-api` | `klynx.camera` | round-trip writer (create + update) |
| ResourceGroup tree shape | `klynx-api` | `klynx.resource_groups` | `parentGroupId` lives here; descendant expansion at request time |
| Camera↔Group membership | `klynx-api` (writer) / Permify (store) | Permify tuples | delta-written on update |
| Camera↔Org tuple | `klynx-api` (writer) / Permify (store) | Permify tuples | written once at create; **never** modified by import update path |
| External-source camera fields | `gateway-api` | `klynx.camera.externalSource` | gw-managed; **read-only** on this surface — update rejected `CAMERA_GW_MANAGED` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /resources/camera/export` | klynx-api | klynx-feature (FE download) | XLSX bytes |
| `GET /resources/camera/template` | klynx-api | klynx-feature (FE download) | XLSX with empty `Cameras` + populated `ResourceGroups` |
| `POST /resources/camera/import` (extended) | klynx-feature | klynx-api | multi-sheet XLSX or single-sheet CSV |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Camera doc | `klynx.camera` | klynx-api (read + downstream services) | round-trip per row |
| ResourceGroup doc | `klynx.resource_groups` | klynx-api (read) | round-trip per row when sheet present |

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Export endpoints**: net-new; no compat concern.
- **Import endpoint** — request shape additive, response semantics breaking:
  - **Request shape additive:** legacy file shape is still accepted — CSV without `id` column or XLSX without `ResourceGroups` sheet routes through `id`-empty create branch. Legacy callers without `allowCreateWithProvidedIds` form field default to `false` (safe).
  - **Response semantics change (v1 → v2):** in-DB IP duplicate is no longer a per-row reject; it is a non-blocking warning surfaced in `results[].warnings.duplicateIPInDB`. **Rows with duplicate IPs WILL insert in v2 where they did NOT in v1.** This is deliberate to unblock re-import — operators editing an exported file no longer see every row reject for owning the same IP they had on export.
  - **New additive fields:** `outcome ∈ {"created","updated","unchanged","rejected"}`, `details.unchanged`, `details.groupsUnchanged`, `details.results[].warnings.*`. Legacy callers reading only `success` / `error` keep working; callers that want outcome / unchanged-detection / per-row warnings must read v2.
- Minimum consumer version: any FE that wants to surface `outcome`, `unchanged`, or the new warnings must read v2. Older FE that ignores the new fields keeps the same UX as v1, **except** that rows previously rejected for `DUPLICATE_IP_IN_DB` now insert silently in v2 — FE callers that gate on `error` containing `DUPLICATE_IP_IN_DB` must migrate to `warnings.duplicateIPInDB`.
- Deprecation window: v1 IP-reject semantics → v2 IP-warn semantics is hard-cutover at the v4.9.0 deploy. No overlap window because the v1 behaviour blocked legitimate re-import flows. Operators are notified via release notes.

### Replay / Re-sync Behavior

- Re-importing an unmodified export file → idempotent. Every row surfaces `outcome="unchanged"`; `inserted=0`, `updated=0`, `unchanged=N`. **No Mongo writes**, **no `revision++`**, **no Permify tuple churn**. Detection is field-level diff + tuple-set diff; both must be empty for `unchanged`.
- Replay supported: **yes** for round-trip; **no** for one-shot create-only flows (those are still rejected on duplicate id when create-with-id is requested).
- Re-sync trigger: none built-in. If Permify tuple write fails after Mongo update, `permifySyncFailed[]` is surfaced; operator manually re-saves the camera through UI to repair tuple state.
- Concurrent imports: serialized per `(tenantId, orgId)` via 5-min-TTL Mongo advisory lock; second concurrent call → `409 IMPORT_IN_PROGRESS`.

### Write Authority Policy

- `klynx-api` is the sole writer of `klynx.camera`, `klynx.resource_groups`, and the related Permify tuples for this surface.
- `camera.externalSource` and any `gw*`-prefixed fields → read-only on import update path. Round-trip update of a row whose `externalSource != nil` → reject `CAMERA_GW_MANAGED`.
- `camera.password`:
  - On create: encrypted via `utils.EncryptWithKeyringJSON` before insert.
  - On update: empty cell = preserve existing encrypted password; non-empty = re-encrypt and overwrite.
  - **Never returned on export.** Operators who need credential migration use a separate audited surface (out of scope here).
- Migration mode (`allowCreateWithProvidedIds=true`):
  - Double-gated: env flag `IMPORT_ALLOW_PROVIDED_IDS_GLOBAL=true` AND request-time form field both required.
  - Validates UUIDv4 shape on the provided id.
  - Rate-limited 1 import per 60s per `(tenantId, orgId)` (in addition to the per-org advisory lock).
  - Every row created via this mode is audit-logged with event type `cameraImport.createdWithProvidedId` (or `groupImport.createdWithProvidedId`).

---

## 4. Surface Summary

| Type | Name | Method | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/resources/camera/export` | GET | BearerAuth + active org + `organization.manage` | `controllers/deviceapi/camera.go::Export` → `CameraService.ExportOrg` | klynx-feature |
| REST | `/resources/camera/template` | GET | BearerAuth + active org + `organization.manage` | `controllers/deviceapi/camera.go::Template` → `CameraService.ExportTemplate` | klynx-feature |
| REST | `/resources/camera/import` | POST | BearerAuth + active org + `organization.manage` | `controllers/deviceapi/camera.go::Import` → `CameraService.ImportRoundTrip` | klynx-feature |

---

## 5. REST Contract

### 5.1 Export Cameras + Groups

**Endpoint:** `/resources/camera/export`
**Method:** `GET`
**Auth:** `BearerAuth` + active org; caller must pass `guardManageOrg`
**Purpose:** Download XLSX containing the org's full camera + resourceGroup inventory with id-bearing columns suitable for re-import.

#### Path / Query Params

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `format` | enum | no | `xlsx` | only `xlsx` supported in v1 |
| `scope` | enum | no | `org` | only `org` supported in v1; future `group` reserved |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | active org id |

#### Success Response

**HTTP:** `200`
**Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
**Content-Disposition:** `attachment; filename="klynx-cameras-<orgSlug>-<YYYYMMDD>.xlsx"`

Body: XLSX bytes with two sheets (see §5.4 Sheet Schemas).

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_FORMAT` | `format` not in supported set |
| 401 | `UNAUTHORIZED` | token missing/invalid |
| 403 | `FORBIDDEN` | caller lacks `organization.manage` |
| 503 | `EXPORT_TOO_LARGE` | org exceeds soft cap (10k cameras); contact ops |
| 500 | `EXPORT_FAILED` | unexpected serialization error |

### 5.2 Download Template

**Endpoint:** `/resources/camera/template`
**Method:** `GET`
**Auth:** same as export
**Purpose:** Download XLSX with empty `Cameras` data rows + populated `ResourceGroups` data rows. Lets operators on a fresh deploy create groups via UI first, then download a template that already has the new groupIds, fill in cameras, and re-upload.

Same query params, headers, response shape, and error contract as export.

Filename: `klynx-cameras-template-<orgSlug>-<YYYYMMDD>.xlsx`

### 5.3 Import (Extended Round-Trip)

**Endpoint:** `/resources/camera/import`
**Method:** `POST`
**Auth:** `BearerAuth` + active org + `guardManageOrg`
**Purpose:** Upload CSV/XLSX and create / update cameras + resourceGroups with id-keyed upsert semantics.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | active org id |
| `Content-Type` | yes | `multipart/form-data` |

#### Request Body

`multipart/form-data` with the following fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file (`.csv` หรือ `.xlsx`) | yes | round-trip file. UTF-8 CSV (single sheet) หรือ XLSX (one or two sheets) |
| `allowCreateWithProvidedIds` | string `"true"` \| `"false"` | no, default `"false"` | migration mode opt-in. Honored only when env `IMPORT_ALLOW_PROVIDED_IDS_GLOBAL=true`; otherwise request fails `403 PROVIDED_IDS_DISABLED_BY_ENV` |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "Import completed",
  "status": true,
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
      { "row": 2, "name": "Bangkok HQ", "groupId": "rg-1...", "outcome": "created" },
      { "row": 3, "name": "Floor 1", "groupId": "rg-2...", "outcome": "created" },
      { "row": 4, "name": "Pattaya Branch", "groupId": "rg-3...", "outcome": "updated" }
    ],
    "results": [
      {
        "row": 2,
        "name": "CC-066",
        "camId": "4b8d2a4e-55d2-4f5f-9f43-1a7e3f1c0001",
        "outcome": "updated",
        "success": true
      },
      {
        "row": 3,
        "name": "CC-099",
        "camId": "new-uuid-...",
        "outcome": "created",
        "success": true,
        "warnings": { "duplicateIPInFile": "10.236.4.102" }
      },
      {
        "row": 5,
        "name": "CC-200",
        "outcome": "rejected",
        "success": false,
        "error": "CAMERA_NOT_FOUND: id provided but camera not in this org; set allowCreateWithProvidedIds=true to create with this id"
      }
    ]
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `details.totalRows` | int | total data rows across both sheets |
| `details.inserted` | int | camera rows inserted (`outcome=created`) |
| `details.updated` | int | camera rows updated (`outcome=updated` — at least one field or the tuple set differed) |
| `details.unchanged` | int | camera rows matched by id with empty field-diff AND empty tuple-diff (`outcome=unchanged`); no Mongo write, no revision bump, no Permify churn |
| `details.groupsUnchanged` | int | group rows matched by id with empty field-diff (`outcome=unchanged` on the groups sheet) |
| `details.invalidRows` | string[] | row numbers (per sheet, prefixed `cameras:N` or `groups:N`) that parse-failed before reaching reconcile |
| `details.duplicateIPInFile` | string[] | IPs that appeared more than once across the `Cameras` sheet (warning surface only — rows still proceed) |
| `details.duplicateIPInDB` | string[] | IPs already in DB matched by **create rows** only (warning surface; not reported when an update row keeps the same IP) |
| `details.permifySyncFailed` | string[] | camIds whose Mongo write committed but Permify tuple delta failed |
| `details.groupResults[]` | object[] | per-row outcome for `ResourceGroups` sheet (omitted when sheet absent) |
| `details.groupResults[].row` | int | row number within the `ResourceGroups` sheet (1-based; header = 1) |
| `details.groupResults[].groupId` | string | resolved or assigned groupId |
| `details.groupResults[].outcome` | enum | `"created" \| "updated" \| "unchanged" \| "rejected"` |
| `details.groupResults[].error` | string | `ERROR_CODE: message` for rejected group rows |
| `details.results[]` | object[] | per-row outcome for `Cameras` sheet |
| `details.results[].row` | int | row number within the `Cameras` sheet (1-based; header = 1) |
| `details.results[].camId` | string | assigned or matched UUID; populated for both `created` and `updated` rows |
| `details.results[].outcome` | enum | `"created" \| "updated" \| "unchanged" \| "rejected"` |
| `details.results[].success` | bool | `true` iff Mongo write for this row succeeded OR the row was `unchanged` (no write needed). Permify failure does NOT downgrade — see `permifySyncFailed[]` |
| `details.results[].error` | string | `ERROR_CODE: message` for rejected rows |
| `details.results[].warnings` | object | non-blocking diagnostic per row |
| `details.results[].warnings.duplicateIPInFile` | string | the IP that collided within the file (camera still imported) |
| `details.results[].warnings.duplicateIPInDB` | string | the IP that already exists in DB (camera still imported on a create row; not surfaced on an update row that keeps its existing IP) |
| `details.results[].unresolvedGroupNames` | string[] | values from the legacy `groups` (name) column that could not be resolved to a groupId in this org. Camera is imported without those parentGroup tuples. |
| `details.results[].unresolvedGroupIds` | string[] | values from `resourceGroupIds` (id) column that did not match any existing group AND were not created by this same upload's `ResourceGroups` sheet. Camera is imported without those parentGroup tuples. |

#### Error Contract — Top-level (HTTP != 200)

Only fires when the entire request fails (parse error, missing required column, etc.). Per-row failures are HTTP 200 with per-row `error`.

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `NO_FILE` | no `file` field in multipart |
| 400 | `INVALID_TYPE` | extension not `.csv` / `.xlsx` |
| 400 | `PARSE_ERROR` | unreadable file |
| 400 | `MISSING_HEADER` | required header missing on `Cameras` sheet (`name`, `url`, `lat`, `long`) or on `ResourceGroups` sheet (`name`) |
| 401 | `UNAUTHORIZED` | token invalid/missing |
| 403 | `FORBIDDEN` | caller lacks `organization.manage` |
| 403 | `PROVIDED_IDS_DISABLED_BY_ENV` | `allowCreateWithProvidedIds=true` sent but env flag is off |
| 409 | `IMPORT_IN_PROGRESS` | another import is already running for this `(tenantId, orgId)`; retry after lock TTL |
| 429 | `MIGRATION_RATE_LIMIT` | migration-mode rate limit (1 per 60s per org) hit |
| 500 | `IMPORT_FAILED` | unexpected error during reconcile |

#### Per-row Error Codes — Cameras sheet

| Code | Meaning | Consumer Handling |
|---|---|---|
| `MISSING_REQUIRED_FIELD` | row missing `name` / `url` / `lat` / `lng` | FE: highlight row |
| `INVALID_LAT_LNG` | lat/lng not parseable as float | FE: highlight row |
| `INVALID_CAM_ID` | `id` value not a UUIDv4 | FE: highlight; suggest export to repopulate |
| `CAMERA_NOT_FOUND` | `id` non-empty, not found in this org, `allowCreateWithProvidedIds=false` | FE: prompt to enable migration mode (admin) or drop the id |
| `CAMERA_ID_COLLISION_DIFFERENT_ORG` | `id` collides with a camera in a different org of the same tenant | FE: surface as data-corruption signal; escalate to ops |
| `CAMERA_GW_MANAGED` | row matches a camera with `externalSource != nil`; round-trip update forbidden | FE: indicate the camera is gw-managed; edit through gw UI instead |
| `CAMERA_CROSS_ORG_MOVE_FORBIDDEN` | row attempts to set `orgId` to a different org than the active org | FE: show error; cross-org move not supported via import |
| `UNSUPPORTED_DEPARTMENT_FIELD` | `department` column non-empty (preserved from v1) | FE: tell user to leave empty |
| `INVALID_MAP_VISIBILITY` | non-empty value not in allowed set (preserved from v1) | FE: show allowed set |

#### Per-row Error Codes — ResourceGroups sheet

Codes align with the shipped `resourceGroup-hierarchy.md` §1 validation table. **Single `INVALID_PARENT` covers self-parent + cycle**, and **`PARENT_NOT_FOUND` covers both "missing in this org" and "exists in a different org"** — the shipped service layer returns the same sentinel for both to avoid leaking cross-org existence (defense by ambiguity). Import sheet reuses these codes verbatim instead of inventing per-cause variants.

| Code | Meaning | Consumer Handling |
|---|---|---|
| `MISSING_REQUIRED_FIELD` | row missing `name` | FE: highlight row |
| `INVALID_GROUP_ID` | `id` value not a UUIDv4 | FE: highlight |
| `GROUP_NOT_FOUND` | `id` non-empty, not found in this org, `allowCreateWithProvidedIds=false` | FE: prompt to enable migration mode |
| `GROUP_ID_COLLISION_DIFFERENT_ORG` | `id` collides with a group in a different org | FE: data-corruption surface |
| `INVALID_PARENT` | proposed parent is self OR is a descendant of self (cycle). Message disambiguates: `"cannot parent group to itself"` vs `"parent would create cycle"` | FE: highlight; render the message under the row |
| `PARENT_NOT_FOUND` | `parentGroupId` / `parentGroupName` / `path` resolved a value that does not exist in this org (also covers cross-org parenting silently — same code by design) | FE: highlight; suggest creating parent first or fixing the value |
| `INVALID_RESOURCE_TYPE` | `resourceType` value not in `{"", "camera", "sensor"}` | FE: show allowed set |
| `INVALID_PATH_NAME_MISMATCH` | `path` cell used as parent fallback but `basename(path) != name` (e.g. `path="A/B/C"` with `name="D"`) | FE: highlight; either fix `name` to match basename or set `parentGroupId` / `parentGroupName` explicitly |
| `RESOURCE_GROUP_NAME_ALREADY_EXISTS` | name conflicts with another group in same org (per-org uniqueness, matches shipped `uq_tenant_org_groupName` index — not per-parent) | FE: highlight; rename either side |

#### Note on Unresolved Groups

Per-row warnings split by source column:

- `unresolvedGroupNames[]` — names from the legacy `groups` column that did not match any existing group in `(tenantId, orgId, resourceType="camera")`. Same semantics as v1.
- `unresolvedGroupIds[]` — ids from the new `resourceGroupIds` column that did not match any existing group AND were not created by this same upload's `ResourceGroups` sheet. (The in-file resolver checks the union of pre-existing groups plus successful `groupResults[]`.)

Neither rejects the camera. The camera is inserted/updated without those parentGroup tuples. FE should render both as warning icons distinct from per-row errors.

#### Note on Permify Drift

Same as v1: Mongo writes commit; Permify delta failures populate `details.permifySyncFailed[]`. `results[].success=true` reflects Mongo only.

---

## 5.4 Sheet Schemas

### `Cameras` Sheet — Header Order (recommended)

```
id,name,location,district,lat,lng,type,ip,user,StreamURL,brand,remark,description,resourceGroupIds,resourceGroupNames,resourceGroupPaths,groups,mapVisibility
```

(Note: `password` is NOT exported. Empty `password` cell on import = preserve. Operators who need credential migration use a separate audited surface.)
(Note: `status`, `department` columns omitted from export; if present on upload they are accepted-but-ignored / rejected-on-non-empty respectively, preserved from v1.)

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
| `user` | `user` | round-trip | populated as-is (plaintext is the same as today) | optional |
| `password` | `password` | **export omits** | — | empty = preserve; non-empty = re-encrypt |
| `url`, `streamurl`, `stream_url` | `url` | round-trip | populated | required (or derived from `ip`) |
| `brand` | `brand` | round-trip | populated | optional |
| `remark`, `note`, `notes`, `comment` | `remark` | round-trip | populated | optional |
| `description`, `desc` | `description` | round-trip | populated | optional |
| `resourceGroupIds` | `resourceGroupIds` | round-trip primary | `;`-delimited groupIds for current Permify tuples | preferred binding; `;`-split, trim, dedupe |
| `resourceGroupNames` | `resourceGroupNames` | export-only readable | `;`-delimited names matching the ids above (for human readability) | **ignored on import** when `resourceGroupIds` present |
| `resourceGroupPaths` | `resourceGroupPaths` | export-only readable | `;`-delimited slash-paths (e.g. `Bangkok/Floor 1`) | **ignored on import** when `resourceGroupIds` present |
| `group`, `groups` | `groups` | legacy | not populated by export (use `resourceGroupIds`) | fallback when `resourceGroupIds` empty (`,`-split, name lookup) |
| `mapvisibility`, `map_visibility`, `visibility` | `mapVisibility` | round-trip | populated | empty → default `inherit`; non-empty must be in allowed set |
| `department` | `department` | not exported | — | reject row if non-empty (preserved from v1) |
| `status` | `status` | not exported | — | accepted-at-header but ignored (preserved from v1) |

### `ResourceGroups` Sheet — Header Order (recommended)

```
id,name,parentGroupId,parentGroupName,path,resourceType,mapVisibility,filterVisibility,description
```

| Header | Internal Key | Direction | On Export | On Import |
|---|---|---|---|---|
| `id`, `groupid`, `resourcegroupid` | `id` (= `groupId`) | round-trip | populated for every group | empty → create; matches → update; non-empty + miss → see migration mode |
| `name` | `name` | round-trip | populated | required |
| `parentGroupId`, `parentid` | `parentGroupId` | round-trip primary | populated with the parent's groupId; **empty cell when group is root** | three-state semantics aligned with shipped `resourceGroup-hierarchy.md` §1 PATCH:<br>• **column absent from sheet entirely** → keep current parent (legacy CSV / minimal-edit upload)<br>• **column present + cell empty** → explicit "move to root" (matches what export wrote for root groups; required for round-trip idempotency)<br>• **column present + cell non-empty** → set to the given groupId after parent-existence + cycle validation |
| `parentGroupName`, `parentname` | `parentGroupName` | export-only readable | populated when parent has a name | fallback when `parentGroupId` empty (lookup by name in same org) |
| `path` | `path` | round-trip | populated as **the row's own full slash-path from root** (e.g. `All Cameras/Bangkok HQ/Floor 1`) | when used as parent fallback (both `parentGroupId` and `parentGroupName` empty): parent = `dirname(path)`, and `basename(path)` MUST equal `name` else row rejected `INVALID_PATH_NAME_MISMATCH`. Single-segment path = root group. |
| `resourceType` | `resourceType` | round-trip | populated | one of `""`, `"camera"`, `"sensor"`; default `""` |
| `mapVisibility` | `mapVisibility` | round-trip | populated | one of `"public"`, `"private"`; default `"private"` (matches shipped `resourceGroup-hierarchy.md` §1 default; does not inherit from parent — see same contract D3) |
| `filterVisibility` | `filterVisibility` | round-trip | populated | one of `"public"`, `"internal"`; default `"public"` |
| `description` | `description` | round-trip | populated | optional |

### Sheet-Order Rules

- `ResourceGroups` is processed first — cameras can reference groupIds that the same upload just created.
- Within the `ResourceGroups` sheet, rows can reference each other's `parentGroupName` / `path` regardless of row order: the parser does two passes (first builds an id-or-name resolver across the whole sheet, second validates / applies per row).
- A camera row that references a group whose `ResourceGroups` row was **rejected** falls through to `unresolvedGroupIds[]` (or `unresolvedGroupNames[]` for legacy `groups` column) warning — camera still imports, just without that tuple.

---

## 6. Event Contract

(N/A — REST only)

---

## 7. Canonical and Projection Mapping

Same as `camera-import-canonical.md` §7 for the create path. New mapping:

### Update path (per-row id matched)

| CSV Header | Camera BSON Field | Transform |
|---|---|---|
| `id` | `camId` (lookup key) | uuid validation; lookup `(tenantId, orgId, camId)` |
| `name` / `location` / `district` / `lat` / `lng` / `type` / `ip` / `url` / `streamUrl` / `brand` / `remark` / `description` / `mapVisibility` | direct fields | PATCH-shape via `UpdateCameraInput`; only-non-empty cells write |
| `password` | `password` | **empty cell = preserve**; non-empty = re-encrypt and overwrite |
| `user` | `user` | trim; **empty cell = preserve** existing value (deviates from create path which writes empty as empty — round-trip safety) |
| `resourceGroupIds` | (Permify delta) | compute add/remove vs current `parentGroup` tuples |
| `groups` (legacy fallback) | (Permify delta) | only when `resourceGroupIds` empty; resolve names → ids; same delta logic |

### Group sheet path (per-row id matched)

| Sheet Header | ResourceGroup BSON Field | Transform |
|---|---|---|
| `id` | `groupId` (lookup key) | uuid validation |
| `name` | `name` | trim |
| `parentGroupId` | `parentGroupId` | three-state per §5.4: column absent → keep current (PATCH-omit); column present + empty cell → set to root (`UpdateParent(ctx, groupId, nil)`); column present + value → set to value after `validateAndApplyParentChange` (shipped) |
| `parentGroupName` | (resolver fallback) | lookup in same org → maps to `parentGroupId` |
| `path` | (resolver fallback for `parentGroupId`) | row's OWN full path. When both `parentGroupId` and `parentGroupName` cells are empty: parent = walk `dirname(path)` from root; **`basename(path)` must equal `name`** (else `INVALID_PATH_NAME_MISMATCH`). Single segment = root group. |
| `resourceType` | `resourceType` | enum validate |
| `mapVisibility` | `mapVisibility` | enum validate |
| `filterVisibility` | `filterVisibility` | enum validate; default `"public"` per filterVisibility-Phase B-Lite |
| `description` | `description` | trim |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `camera.camId` | `CameraRepo.BulkInsert` (uuid) **or** caller (migration mode only) | import / single create | `klynx.camera` | immutable after first write |
| `camera.password` (encrypted) | `CameraRepo` | import / single create / gw sync | `klynx.camera` | round-trip preserves on empty cell; never returned on export |
| `camera.user` | `CameraRepo` | import / single PATCH / gw sync | `klynx.camera` | empty cell on update = preserve; matches create-path policy "stored as-is" only on the create branch |
| `camera.<other>` | `CameraRepo` | import / single PATCH / gw sync | `klynx.camera` | last-writer-wins; revision++ on every update |
| `camera.externalSource.*` | gw sync only | gw sync only | `klynx.camera` | round-trip update path rejects with `CAMERA_GW_MANAGED` |
| `resourceGroup.groupId` | `ResourceGroupRepo` (uuid) **or** caller (migration mode only) | import / single create | `klynx.resource_groups` | immutable after first write |
| `resourceGroup.parentGroupId` | `ResourceGroupRepo` | import / single PATCH | `klynx.resource_groups` | cycle-validated on every write |
| Camera→Org tuple | `CameraService.BulkCreate` | create only | Permify | written once at create; **import update path does NOT touch** |
| Camera→Creator tuple | `CameraService.BulkCreate` | create only | Permify | same |
| Camera→ParentGroup tuple | `CameraService.ImportRoundTrip` | import / UI assign | Permify | delta-written on update — extra tuples deleted, missing tuples added |
| ResourceGroup→Org tuple | `ResourceGroupService.Create` (shipped C1 entry; reused by import) | create only | Permify | written once when a group is inserted via the import sheet (same path as single-create); required for resolver visibility; import update path does NOT touch |

### Conflict Resolution

- Round-trip update path is one-way into klynx canonical stores. Bidirectional sync is out of scope.
- Permify tuple delta is computed after Mongo update commits. Partial Permify failure populates `permifySyncFailed[]` and does not roll back Mongo (consistent with create path).
- `results[].success` reflects Mongo only. Permify state must be cross-checked via `permifySyncFailed[]`.
- gw-managed camera detection is order-of-magnitude cheap (single Mongo `findOne`); the round-trip update path checks BEFORE issuing any update.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Camera export | `GET /resources/camera/export` | `format=xlsx` | trigger browser download via blob |
| Camera template | `GET /resources/camera/template` | `format=xlsx` | trigger browser download via blob |
| Camera import (round-trip) | `POST /resources/camera/import` | `file`, `allowCreateWithProvidedIds?` | render extended `details.results` + `details.groupResults` table |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `<file input>` | `file` (form field) | request | single file |
| `<migration-mode checkbox>` (admin only) | `allowCreateWithProvidedIds` (form field) | request | string `"true"` \| `"false"` |
| `response.details.results[].outcome` | `details.results[].outcome` | response | render badge: created / updated / rejected |
| `response.details.results[].warnings` | `details.results[].warnings` | response | render as inline warning icon next to row |
| `response.details.groupResults` | `details.groupResults` | response | render in a separate "Groups" panel of the result dialog |

### FE Guardrails

- Do NOT guess the sheet schema — pull from this contract.
- Do NOT guess error codes — use the sets in §5.
- Do NOT remove the `id` column when re-importing an exported file — it is the round-trip key.
- Do NOT echo `password` from the export sheet (it is omitted by design); on update, leave the cell empty to preserve.
- Do NOT enable migration-mode checkbox by default — it must be an explicit operator opt-in per upload.
- Do NOT assume `resourceGroupNames` / `resourceGroupPaths` are usable as binding keys — they are export-only readable; the binding key on import is `resourceGroupIds`.
- Do NOT assume `success=true` ⇒ Permify ok — always read `permifySyncFailed[]` separately.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| klynx-api | Contract merged | Before implementation | Codex review gate |
| klynx-api | Phase E1 implementation | After contract approved | Per [docs/plan/done/resource-import-export-roundtrip.md](../plan/done/resource-import-export-roundtrip.md) §10 (Phase E1) |
| klynx-api | Phase E2 implementation | After Phase E1 deployed | Carries IP semantic change (v1 → v2) |
| klynx-api | Phase E3 implementation | After Phase E2 deployed | Multi-sheet support |
| klynx-feature | FE plan opens | After all three BE phases on develop | Separate session |

---

## 11. Examples

### Example Export Filename

`klynx-cameras-pattaya-municipality-20260501.xlsx`

### Example `Cameras` Sheet — exported row

```
id,name,location,district,lat,lng,type,ip,user,StreamURL,brand,remark,description,resourceGroupIds,resourceGroupNames,resourceGroupPaths,groups,mapVisibility
4b8d2a4e-55d2-4f5f-9f43-1a7e3f1c0001,CC-066,ชายหาดพัทยา,พัทยา,12.950201,100.886828,Fix,10.236.4.101,admin,rtsp://10.236.4.101:554/0/onvif/profile4/media.smp,HANWHA VISION,กล้องงานความปลอดภัย,,rg-bangkok;rg-floor1,Bangkok HQ;Floor 1,Root/Bangkok HQ;Root/Bangkok HQ/Floor 1,,private
```

Operator edits the `name` cell to `CC-066-renamed`, leaves everything else, re-uploads. Result:

```json
{
  "details": {
    "totalRows": 1,
    "inserted": 0,
    "updated": 1,
    "unchanged": 0,
    "results": [
      {
        "row": 2,
        "name": "CC-066-renamed",
        "camId": "4b8d2a4e-55d2-4f5f-9f43-1a7e3f1c0001",
        "outcome": "updated",
        "success": true
      }
    ]
  }
}
```

### Example Idempotent Re-Import (no changes)

Operator downloads the export and immediately re-uploads without editing. Result:

```json
{
  "details": {
    "totalRows": 1,
    "inserted": 0,
    "updated": 0,
    "unchanged": 1,
    "groupsUnchanged": 0,
    "results": [
      {
        "row": 2,
        "name": "CC-066",
        "camId": "4b8d2a4e-55d2-4f5f-9f43-1a7e3f1c0001",
        "outcome": "unchanged",
        "success": true
      }
    ]
  }
}
```

No Mongo write, no `revision++`, no Permify tuple churn. Operators can use re-import as a "verify the file is current" smoke test without side effects.

### Example Migration-Mode Import (provided ids)

Operator from old klynx instance (org A) ran `GET /resources/camera/export`; on a fresh klynx-api deploy at customer X, ops set `IMPORT_ALLOW_PROVIDED_IDS_GLOBAL=true`; operator on the new instance creates the org, then uploads the same file with `allowCreateWithProvidedIds=true`. Cameras land with their original camIds preserved; downstream consumers (event projections, delivery targets) keep working.

### Example Tree Round-Trip

`ResourceGroups` sheet from a 3-level export:

```
id,name,parentGroupId,parentGroupName,path,resourceType,mapVisibility,filterVisibility,description
rg-root,All Cameras,,,All Cameras,,public,public,Org root
rg-bangkok,Bangkok HQ,rg-root,All Cameras,All Cameras/Bangkok HQ,camera,public,public,
rg-floor1,Floor 1,rg-bangkok,Bangkok HQ,All Cameras/Bangkok HQ/Floor 1,camera,public,public,
```

Operator adds a new row `rg-floor2` with no `id`, sets `parentGroupName=Bangkok HQ`. Re-uploads. Result:

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

The first 3 rows match by id with zero field-diff → `outcome="unchanged"`, no Mongo write fires for those rows. Only the new `Floor 2` row writes. Re-uploading this same file again would yield `groupsUnchanged: 4` and `outcome="unchanged"` for all 4 rows — true round-trip idempotency.

### Example Permify-Drift Response

```json
{
  "details": {
    "totalRows": 2,
    "inserted": 0,
    "updated": 2,
    "permifySyncFailed": ["a1b2...", "c3d4..."],
    "results": [
      { "row": 2, "name": "CC-066", "camId": "a1b2...", "outcome": "updated", "success": true },
      { "row": 3, "name": "CC-067", "camId": "c3d4...", "outcome": "updated", "success": true }
    ]
  }
}
```

---

## 12. Checklist

- [x] Owner backend explicit (`klynx-api`)
- [x] System of record defined per domain
- [x] Canonical store and projection store documented
- [x] Producers and consumers listed
- [x] Request, response, and error contracts defined
- [x] Field ownership explicit for synchronized fields (Permify tuple delta)
- [x] Backward compatibility documented (additive request shape; v1→v2 semantic change on IP)
- [x] Replay / re-sync behaviour documented (idempotent by id; no fileHash dedup)
- [x] FE field mapping included
- [x] Codex review verdict captured (Ready after revision, rev 1, 2026-05-01 — see plan §9)

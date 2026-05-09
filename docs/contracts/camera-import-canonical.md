# Camera Import — Canonical Endpoint Contract

**Date:** 2026-04-23
**Status:** Superseded (in part) by [`resource-group.md`](./resource-group.md) on 2026-05-04 — the v2 round-trip in `resource-group.md` §5.6 supersedes this v1 import-only contract's import path. The Cameras sheet schema, per-row outcome semantics (`created`/`updated`/`unchanged`/`rejected`), idempotent re-import (field-level + tuple-set diff), migration mode (double-gate `IMPORT_ALLOW_PROVIDED_IDS_GLOBAL` + UUIDv4 + 1/60s rate limit + audit log), `success`-vs-`permifySyncFailed[]` separation, and gw-managed `CAMERA_GW_MANAGED` readonly enforcement are all preserved verbatim in `resource-group.md` §5.6. Body kept here for PR / consumer history. (Housekeeping fix from Cluster #5 audit cleanup — predecessor chain marker missed in the original Cluster #5 commit `31ec92c`; corrected here in Cluster #1 cleanup.)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/camera-import-canonical.md](../plan/camera-import-canonical.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v1

---

## 1. Purpose

สัญญานี้นิยามรูปแบบ bulk import camera จาก CSV/XLSX ผ่าน endpoint canonical เดียวของ klynx-api

- `klynx-api` เป็นเจ้าของ endpoint และเป็นผู้เขียน projection (`klynx.camera`) + Permify tuple
- `klynx-feature` consume contract นี้โดยตรง — ห้ามเดาคอลัมน์ CSV, ห้ามเดา error code, ห้ามเดา default value
- Endpoint legacy `POST /devices/import` ถูก **ลบ** โดย plan ที่ link ข้างบน; client ใดๆ ที่ยังเรียกต้อง migrate ก่อน cutover

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Klynx camera projection | `klynx-api` | `klynx.camera` | projection / consumer model for klynx workflows |
| ResourceGroup definition | `klynx-api` | `klynx.resource_groups` | group name/metadata |
| Camera ↔ ResourceGroup membership | `klynx-api` (writer) / Permify (store) | Permify tuples | `camera#parentGroup@resourceGroup` |
| Camera ↔ Organization binding | `klynx-api` (writer) / Permify (store) | Permify tuples | `camera#parentOrg@organization` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST /resources/camera/import` | klynx-feature (FE upload UI) | klynx-api | canonical entry |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Camera doc | `klynx.camera` | klynx-api (read + downstream services) | created per row |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Status: **breaking** vs. legacy `/devices/import` (removed)
- Within canonical `/resources/camera/import`: **additive** — new CSV columns recognized, new per-row error reason codes; request schema remains `multipart/form-data` with single `file` field
- Minimum consumer version: FE ต้องแสดง per-row error code reasons ใหม่ได้ (`UNSUPPORTED_DEPARTMENT_FIELD`, `GROUP_NOT_FOUND`, `INVALID_MAP_VISIBILITY`) — แต่ถ้าไม่แสดงจะไม่ break ฟังก์ชัน (fallback: แสดง string error เดิม)
- Deprecation window: `/devices/import` hard-remove without deprecation window audit completed 2026-04-23 across repos listed in `AGENTS.md` + accessible local `/home` scan ไม่พบ active caller:
  - `klynx-feature` — no caller found (canonical endpoint already used in 2 components)
  - `gateway-portal` — no caller found
  - `gateway-api` — stale controller/docs exist but route registration commented out; **dead code**, not runtime surface; housekeeping deferred to separate PR
- Consumer handling ของ stale doc ใน `gateway-api`: ignore; ไม่ใช่ blocker ของ klynx-api removal

### Replay / Re-sync Behavior

- Replay supported: **no** — import เป็น idempotent-by-IP เท่านั้น (duplicate IP check within file + DB)
- Re-sync trigger: ไม่มี built-in — ถ้า Permify tuple write fail หลัง Mongo insert, คืน `permifySyncFailed[]` ให้ operator ทำ re-assign ผ่าน UI (manual); ไม่มี auto-retry ใน version นี้
- Duplicate delivery rule: duplicate IP (ใน file เดียวกัน หรือ ใน DB) ทำให้ row ถูก reject

### Write Authority Policy

- `klynx-api` เป็นผู้เขียน `klynx.camera` projection และ Permify tuples ของ import นี้
- Camera password เข้ารหัสโดย `klynx-api/internal/crypto/secretbox` ก่อนเก็บ (via `utils.EncryptWithKeyringJSON`)
- `camera.status` (online/offline) ไม่ใช่ field ที่ import เขียน — authoritative writer คือ **runtime probe / monitor flow**; CSV `status` column จึง accepted-but-ignored (ดู §7 Field Mapping)
- Projection store ไม่ถือเป็น canonical camera record ข้าม repo — ถ้าต้อง sync ไป gateway-api ทำผ่าน flow แยก (`phase-e-device-sync-plan.md`)

---

## 4. Surface Summary

| Type | Name | Method | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/resources/camera/import` | POST | BearerAuth + active org | `controllers/deviceapi/camera.go::ImportCameras` → `CameraService.ImportFromCSV / ImportFromXLSX` | klynx-feature |

### Removed Surfaces (tracked for audit)

| Type | Name | Status | Reason |
|---|---|---|---|
| REST | `/devices/import` | **removed** | superseded by canonical; legacy dumped raw maps without authz; audit completed 2026-04-23 with no active caller found (see §3 Backward Compatibility) |

---

## 5. REST Contract

### 5.1 Import Cameras (Canonical)

**Endpoint:** `/resources/camera/import`
**Method:** `POST`
**Auth:** `BearerAuth` + active org; caller ต้องผ่าน `guardManageOrg`
**Purpose:** อัปโหลด CSV/XLSX เพื่อสร้าง camera หลายตัวใน org เดียว พร้อมผูก Permify tuple `camera → parentOrg`, `camera → creator`, และ (ตาม CSV) `camera → parentGroup`

#### Path Params

(none)

#### Query Params

(none)

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | active org id (must match token scope) |
| `Content-Type` | yes | `multipart/form-data` |

#### Request Body

`multipart/form-data` with exactly one field:

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | file (`.csv` หรือ `.xlsx`) | yes | Camera template file. UTF-8 CSV หรือ Excel XLSX; header row อยู่บรรทัดที่ 1 |

#### CSV / XLSX Template

**Header row (recommended order):**

```
name,location,district,lat,lng,type,status,ip,user,password,StreamURL,brand,remark,department,groups,mapVisibility
```

**Header alias** (case-insensitive; backend canonicalize เป็น internal key):

| Accepted header | Internal key | Notes |
|---|---|---|
| `name` | `name` | required |
| `location`, `loc` | `location` | |
| `district` | `district` | |
| `lat`, `latitude` | `lat` | required, numeric |
| `lng`, `long`, `lon`, `longitude`, `longtitude` | `long` | required, numeric |
| `type`, `camtype`, `cam_type` | `type` | e.g. `Fix`, `PTZ` |
| `status` | `status` | **accepted at parse, not persisted** — backward-compat of template only; `camera.status` is owned by runtime probe (see §7, §8) |
| `ip` | `ip` | IPv4; used for duplicate check |
| `user` | `user` | RTSP username — stored as-is |
| `password` | `password` | RTSP password; encrypted at rest before insert |
| `url`, `streamurl`, `stream_url` | `url` | required; RTSP url; `ip` resolved from url host if `ip` not explicitly given |
| `brand` | `brand` | |
| `remark`, `note`, `notes`, `comment` | `remark` | |
| `description`, `desc` | `description` | |
| `group`, `groups` | `groups` | comma-separated group names; scope `tenantId + orgId + resourceType=camera`; case-insensitive + trim + NFC. Unresolved names are skipped (not rejected) — see §5 Request Field Definitions |
| `mapvisibility`, `map_visibility`, `visibility` | `mapVisibility` | one of `inherit`, `public`, `forcePublic`, `private`, `forcePrivate`; empty → default `inherit`; non-empty invalid → row reject |
| `department` | `department` | **must be empty** — any non-empty value causes row reject |

#### Request Field Definitions (per-row, after parse)

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `name` | string | yes | client | camera display name |
| `lat` | number | yes | client | latitude, decimal degrees |
| `lng` | number | yes | client | longitude, decimal degrees |
| `url` | string | yes | client | RTSP url |
| `ip` | string | no | client | IPv4; derived from url if omitted |
| `user` | string | no | client | RTSP user — **stored as-is** (empty column → empty field). RTSP URL-builder may default `admin` at stream time, but the import writer does not backfill this field |
| `password` | string | no | client | RTSP password; encrypted by `klynx-api` before write; empty stays empty |
| `mapVisibility` | enum | no | client | allowed: `inherit`, `public`, `forcePublic`, `private`, `forcePrivate`. empty → default `inherit` (silent); non-empty invalid → reject row `INVALID_MAP_VISIBILITY` |
| `groups` | string | no | client | comma-separated group names. Each name is resolved against existing `resourceGroup` records (scope: `tenantId + orgId + resourceType=camera`). **Unresolved names are silently skipped — camera is still inserted, but no `parentGroup` tuple is written for the missing names.** Skipped names appear in `results[].unresolvedGroups[]` for the FE to surface. |
| `department` | string | no | client | **must be empty**; reserved surface; non-empty → row reject |
| `description`, `location`, `district`, `type`, `brand`, `remark` | string | no | client | optional metadata |
| `status` | string | no | client | **accepted at header but not persisted**. Value is ignored by the import writer; `camera.status` (bool) is always initialized to `true` and maintained by runtime monitor/probe flow |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "Import completed",
  "status": true,
  "details": {
    "totalRows": 10,
    "inserted": 8,
    "invalidRows": ["4"],
    "duplicateIPInFile": ["10.236.4.102"],
    "duplicateIPInDB": [],
    "permifySyncFailed": [],
    "results": [
      {
        "row": 2,
        "name": "CC-066",
        "camId": "4b8d2a4e-55d2-4f5f-9f43-1a7e3f1c0001",
        "success": true
      },
      {
        "row": 3,
        "name": "CC-099",
        "success": false,
        "error": "UNSUPPORTED_DEPARTMENT_FIELD: department is not a permission binding; leave it empty"
      }
    ]
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `details.totalRows` | int | จำนวน row ทั้งหมดใน file (รวม invalid rows) |
| `details.inserted` | int | จำนวน row ที่ insert สำเร็จ (`success=true`) |
| `details.invalidRows` | string[] | row numbers (1-based, รวม header) ที่ parse fail ก่อนถึง bulk insert |
| `details.duplicateIPInFile` | string[] | IP ที่ซ้ำระหว่าง row ใน file เดียวกัน |
| `details.duplicateIPInDB` | string[] | IP ที่มีอยู่แล้วใน `klynx.camera` ของ org นี้ |
| `details.permifySyncFailed` | string[] | camIds ที่ Mongo insert สำเร็จแต่ Permify tuple write fail; operator ต้อง re-assign manual |
| `details.results[]` | object[] | per-row result |
| `details.results[].row` | int | row number (1-based, header = 1) |
| `details.results[].name` | string | camera name (ถ้า parse ได้) |
| `details.results[].camId` | string | assigned uuid เมื่อ `success=true` |
| `details.results[].success` | bool | **`true` iff Mongo insert for this row succeeded.** Permify failure does NOT downgrade this flag — check `details.permifySyncFailed[]` instead for authz drift |
| `details.results[].error` | string | `ERROR_CODE: message` สำหรับ row ที่ fail (Mongo-level fail or validation-level reject) |
| `details.results[].unresolvedGroups` | string[] | group names จาก CSV ที่ resolve ไม่ได้ (ไม่พบ resourceGroup ที่ตรงชื่อ, scope `tenantId + orgId + resourceType=camera`) — camera ถูก insert แต่ไม่ผูก group เหล่านี้; FE ควรแสดงเป็น warning (non-blocking) |

#### Error Contract

Top-level error (HTTP != 200) ใช้เฉพาะเมื่อ **ทั้ง request** fail — ไม่ใช่ per-row fail:

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `NO_FILE` | ไม่มี file ใน multipart | FE: แสดง prompt ให้เลือกไฟล์ |
| 400 | `INVALID_TYPE` | extension ไม่ใช่ `.csv` / `.xlsx` | FE: บอก user supported formats |
| 400 | `PARSE_ERROR` | อ่าน CSV/XLSX ไม่ได้ (encoding / structure) | FE: แสดง error message; แนะนำให้ re-export |
| 400 | `MISSING_HEADER` | header row ขาด required column (`name`, `url`, `lat`, `long`) | FE: แสดง missing headers |
| 401 | `UNAUTHORIZED` | token invalid/missing | FE: redirect login |
| 403 | `FORBIDDEN` | caller ไม่มี permission จัดการ org | FE: แสดง access denied |
| 500 | `IMPORT_FAILED` | unexpected error ระหว่าง bulk insert | FE: retry; escalate ถ้าซ้ำ |

Per-row error (HTTP 200, บันทึกใน `results[].error`):

| Code | Meaning | Consumer Handling |
|---|---|---|
| `MISSING_REQUIRED_FIELD` | row ขาด `name`/`url`/`lat`/`lng` | FE: highlight row |
| `INVALID_LAT_LNG` | lat/lng parse เป็น float ไม่ได้ | FE: highlight row |
| `DUPLICATE_IP_IN_FILE` | IP ซ้ำกับ row อื่นใน file เดียวกัน | FE: highlight both rows |
| `DUPLICATE_IP_IN_DB` | IP มีอยู่แล้วใน DB | FE: highlight row |
| `UNSUPPORTED_DEPARTMENT_FIELD` | `department` column มีค่า — ไม่ใช่ permission binding | FE: แจ้ง user ว่า department ไม่ใช่ field backend ใช้; ให้ทิ้งค่าว่าง |
| `INVALID_MAP_VISIBILITY` | ค่า `mapVisibility` มีแต่ไม่อยู่ในชุดที่อนุญาต | FE: แสดง allowed set |

**Note on `groups`**: group names ที่ resolve ไม่ได้ **ไม่** reject row; camera ถูก insert ปกติ (ไม่ผูก group นั้น) ชื่อที่ skip รายงานต่อ row ใน `results[].unresolvedGroups[]` — FE ควรแสดงเป็น warning icon ข้างแถว ไม่ใช่ error

**Note**: Permify tuple write failure is **not** a per-row error code. Mongo-inserted rows keep `success=true`; affected camIds are surfaced only in top-level `details.permifySyncFailed[]`. FE should render that list as a separate warning with runbook link.

#### Error Example (per-row reject)

```json
{
  "row": 4,
  "name": "CC-099",
  "success": false,
  "error": "UNSUPPORTED_DEPARTMENT_FIELD: department is not a permission binding; leave it empty"
}
```

#### Warning Example (per-row skip unresolved groups)

```json
{
  "row": 5,
  "name": "CC-100",
  "camId": "e5f6...",
  "success": true,
  "unresolvedGroups": ["กลุ่มพื้นที่สาธารณะ", "กลุ่มทดสอบ"]
}
```

---

## 6. Event Contract

(N/A — REST only)

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `klynx-api`
- Store: `klynx.camera` (camera projection) + Permify tenant tuples (membership)
- Canonical fields: see Section 8

### Projection Store

- (this contract itself emits the projection — ไม่มี secondary projection)

### Field Mapping (CSV → Camera doc)

| CSV Header | Camera BSON Field | Transform |
|---|---|---|
| `name` | `name` | trim |
| `location` | `location` | trim |
| `district` | `district` | trim |
| `lat` | `lat` | parse float |
| `lng` (`long`/`longitude`) | `lng` | parse float |
| `type` | `type` | trim |
| `status` | **not persisted** | column accepted at parse, but import writer does NOT set `camera.status` from CSV; hardcoded `true` at insert |
| `ip` | `ip` | trim; derive from `url` host if empty |
| `user` | `user` | trim; **stored as-is** (empty → empty). `admin` default is applied only by the RTSP URL-builder at stream time, not here |
| `password` | `password` | encrypt via `utils.EncryptWithKeyringJSON`; empty stays empty |
| `StreamURL` (`url`/`streamurl`) | `streamUrl` + `url` | stored on both fields (existing behavior) |
| `brand` | `brand` | trim |
| `remark` | `remark` | trim |
| `description` | `description` | trim |
| `mapVisibility` | `mapVisibility` | empty → `"inherit"` (silent); non-empty must be in allowed set else row is rejected `INVALID_MAP_VISIBILITY` |
| `groups` | (not stored on camera) | comma-split + trim + NFC + case-insensitive; resolved to `[]groupId` in scope `tenantId + orgId + resourceType="camera"`; emitted as Permify tuples `camera#parentGroup@resourceGroup:<id>`; **missing name is skipped (not rejected)** — camera is inserted without that tuple and the missing name is reported in `results[].unresolvedGroups[]` |
| `department` | (not stored) | reject row if non-empty |

**Server-generated fields** (not from CSV):

| Field | Source |
|---|---|
| `camId` | UUID v4 at `BulkInsert` |
| `tenantId` | from caller token |
| `orgId` | from `X-Active-Org` |
| `createdBy` | caller user id |
| `createAt` | `time.Now()` |
| `status` | hardcoded `true` (authoritative writer = runtime probe; see §8) |
| `state` | hardcoded `"active"` |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `camera.camId` | `CameraRepo.BulkInsert` | import only | `klynx.camera` | immutable, generated |
| `camera.password` (encrypted) | `CameraRepo` | import / single create / gw sync | `klynx.camera` | always encrypted; never stored plaintext |
| `camera.user` | `CameraRepo` | import / single create / gw sync | `klynx.camera` | stored as-is; import writer does not backfill defaults |
| `camera.mapVisibility` | `CameraRepo` | import / manual update / gw sync | `klynx.camera` | last-writer-wins |
| `camera.status` (bool online/offline) | **runtime probe / monitor flow** | monitor only | `klynx.camera` | import does NOT write this field per-row; `BulkInsert` initializes to `true` on insert as baseline |
| `camera.state` (enum) | `CameraRepo` + state machine | create / lifecycle paths | `klynx.camera` | `BulkInsert` initializes `"active"` |
| Camera→Org tuple | `CameraService.BulkCreate` | import / single create | Permify | written once at insert |
| Camera→Creator tuple | `CameraService.BulkCreate` | import / single create | Permify | written once at insert |
| Camera→ParentGroup tuple | `CameraService.BulkCreate` | import / UI group assign | Permify | re-written on re-assign; delta per tuple |

### Conflict Resolution

- Import ไม่ bidirectional — เป็น one-way เข้า klynx.camera
- Permify write เกิดหลัง Mongo insert; ถ้า Permify fail → camId อยู่ใน `permifySyncFailed[]` แต่ camera doc **ยัง commit** ใน Mongo (รายงานเท่านั้น ไม่ rollback; no auto-retry)
- `results[].success` สะท้อนเฉพาะสถานะ Mongo insert — Permify write result อยู่ใน `permifySyncFailed[]` ไม่ร่วมใน `success`
- Echo-loop ไม่เกิดเพราะไม่มี event bridge ออก

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Camera import UI | `POST /resources/camera/import` | `file` (multipart) | แสดง per-row result table; highlight failed rows; แสดง `permifySyncFailed[]` เป็น warning แยก |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `<file input>` | `file` (form field) | request | single file |
| `response.details.results` | `details.results[]` | response | render per-row |
| `response.details.inserted` | `details.inserted` | response | show success count |
| `response.details.invalidRows` | `details.invalidRows[]` | response | render as warning |
| `response.details.permifySyncFailed` | `details.permifySyncFailed[]` | response | separate warning; link to runbook |

### FE Guardrails

- อย่าเดา CSV template — ดึงจาก [docs/contracts/camera-import-canonical.md](camera-import-canonical.md) ตรงนี้
- อย่าเดา error code — ใช้ชุดที่ระบุใน Section 5
- อย่าส่ง field `department` ใน CSV โดยเจตนา — backend reject row
- `mapVisibility` empty = default `inherit`; non-empty invalid = reject — FE ไม่ต้องเติม `inherit` เองเมื่อเว้นว่าง
- อย่าคาดหวังว่า CSV `status` column จะ control camera state — backend ignore เพื่อจัด authority ให้ runtime probe; ถ้า UI ต้องการเปลี่ยน state ใช้ single-update endpoint หลัง import
- อย่า parse RTSP password จาก url แทน `password` column — password ถูก encrypt server-side
- อย่าคิดว่า `success=true` = Permify ok; เช็ก `permifySyncFailed[]` ด้วยเสมอ
- `results[].unresolvedGroups` เป็น warning (non-blocking) — camera ถูก insert แล้ว แต่ group ชื่อนั้น skip; แสดง warning icon ไม่ใช่ error

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| klynx-api | Contract merged | Before implementation | Codex review gate |
| klynx-api | Implementation | After contract approved | Per [docs/plan/camera-import-canonical.md](../plan/camera-import-canonical.md) §10 |
| klynx-feature | Optional — per-row error display | After klynx-api deploy | nice-to-have; fallback ยัง backward compatible |

---

## 11. Examples

### Example Request (curl)

```bash
curl -X POST https://api.example.com/kapi/resources/camera/import \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Active-Org: ${ORG_ID}" \
  -F "file=@camera-template.csv"
```

### Example CSV (2 rows)

```csv
name,location,district,lat,lng,type,status,ip,user,password,StreamURL,brand,remark,department,groups,mapVisibility
CC-066,ชายหาดพัทยา,พัทยา,12.950201,100.886828,Fix,online,10.236.4.101,admin,P@ssw0rd1,rtsp://admin:P@ssw0rd1@10.236.4.101:554/0/onvif/profile4/media.smp,HANWHA VISION,กล้องงานความปลอดภัย,,กลุ่มพื้นที่สาธารณะ,private
CC-067,ชายหาดพัทยา,พัทยา,12.946832,100.884809,Fix,online,10.236.4.102,admin,P@ssw0rd1,rtsp://admin:P@ssw0rd1@10.236.4.102:554/0/onvif/profile4/media.smp,HANWHA VISION,กล้องงานความปลอดภัย,,กลุ่มพื้นที่สาธารณะ,private
```

### Example Success Response (all rows ok)

```json
{
  "code": "SUCCESS",
  "message": "Import completed",
  "status": true,
  "details": {
    "totalRows": 2,
    "inserted": 2,
    "invalidRows": [],
    "duplicateIPInFile": [],
    "duplicateIPInDB": [],
    "permifySyncFailed": [],
    "results": [
      { "row": 2, "name": "CC-066", "camId": "a1b2...", "success": true },
      { "row": 3, "name": "CC-067", "camId": "c3d4...", "success": true }
    ]
  }
}
```

### Example Partial-Failure Response (validation rejects + unresolved groups)

```json
{
  "code": "SUCCESS",
  "message": "Import completed with partial failures",
  "status": true,
  "details": {
    "totalRows": 3,
    "inserted": 2,
    "invalidRows": [],
    "duplicateIPInFile": [],
    "duplicateIPInDB": [],
    "permifySyncFailed": [],
    "results": [
      { "row": 2, "name": "CC-066", "camId": "a1b2...", "success": true },
      { "row": 3, "name": "CC-099", "success": false,
        "error": "UNSUPPORTED_DEPARTMENT_FIELD: department is not a permission binding; leave it empty" },
      { "row": 4, "name": "CC-100", "camId": "c3d4...", "success": true,
        "unresolvedGroups": ["nonexistent"] }
    ]
  }
}
```

**Read**: row 4 ถูก insert สำเร็จ (`success=true`) แต่ group ชื่อ `"nonexistent"` ไม่เจอ — camera ถูกเก็บโดยไม่ผูก group นั้น FE ควรแสดงเป็น warning

### Example Permify-Drift Response (Mongo ok, authz failed)

```json
{
  "code": "SUCCESS",
  "message": "Import completed; some cameras require manual permission re-sync",
  "status": true,
  "details": {
    "totalRows": 2,
    "inserted": 2,
    "invalidRows": [],
    "duplicateIPInFile": [],
    "duplicateIPInDB": [],
    "permifySyncFailed": ["a1b2...", "c3d4..."],
    "results": [
      { "row": 2, "name": "CC-066", "camId": "a1b2...", "success": true },
      { "row": 3, "name": "CC-067", "camId": "c3d4...", "success": true }
    ]
  }
}
```

**Note**: Both camIds appear in `permifySyncFailed[]` but `success=true` per row — Mongo writes committed; operator must re-assign Permify tuples manually.

---

## 12. Checklist

- [x] Owner backend is explicit (`klynx-api`)
- [x] System of record is defined by domain
- [x] Canonical store and projection store are documented
- [x] Producers and consumers are listed
- [x] Request, response, and error contracts are defined
- [x] Field ownership is explicit for synchronized fields (Permify tuples)
- [x] Backward compatibility is documented (breaking vs. legacy; additive within canonical)
- [x] Replay or re-sync behavior is documented (not supported — idempotent by IP only)
- [x] FE field mapping is included

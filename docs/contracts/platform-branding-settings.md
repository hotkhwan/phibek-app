# Platform Branding Settings Contract

**Date:** 2026-04-21
**Status:** Draft (rev 3 after Codex review)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/platform-branding-settings.md](../plan/platform-branding-settings.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v1

---

## 1. Purpose

Defines the per-org platform branding API published by `klynx-api` and consumed by `klynx-feature`. Covers text settings (name, locale, theme, color) and asset upload (logo variants, favicon). Consumers must implement exactly against this contract.

**Phase 1 excludes pre-auth / anonymous branding** — see plan §2 Out of Scope.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Per-org branding text fields | `klynx-api` | `options` collection, doc `_id = "system.setting.<orgId>"` | upsert-on-patch |
| Branding asset binaries | `klynx-api` → S3 | public bucket — `config.S3PublicBuckets["public"]` (default env `S3_PUBBUCKET=public`), prefix `branding/<orgId>/` | uploaded via `s3.Upload(ctx, "public", true, objectKey, bytes, contentType)`; deleted via `s3.DeleteByURL` |

### Producer / Consumers

| Surface | Producer | Consumers | Auth |
|---|---|---|---|
| `GET /kapi/system/configs/platform` | klynx-api | klynx-feature (root layout, header, `/settings/platform`) | Bearer + `X-Active-Org` + Permify `organization.view` (via `middleware.ActiveOrg`) |
| `PATCH /kapi/system/configs/platform` | klynx-api | klynx-feature `/settings/platform` | Bearer + `X-Active-Org` + Permify `organization.manage` (service-layer check) |
| `POST /kapi/system/configs/platform/asset` | klynx-api | klynx-feature `/settings/platform` | Bearer + `X-Active-Org` + Permify `organization.manage` |
| `DELETE /kapi/system/configs/platform/asset/:variant` | klynx-api | klynx-feature `/settings/platform` | Bearer + `X-Active-Org` + Permify `organization.manage` |

### Projection Stores

None.

---

## 3. Compatibility and Policy

### Backward Compatibility

- Status: **additive**. New fields on `OrgStreamSetting`; no existing field changes semantics.
- Consumer requirements: clients must accept unknown fields and tolerate unset branding (defaults resolved server-side).
- Deprecation window: n/a.

### Replay / Re-sync Behavior

- N/A. No events, no projections.

### Write Authority Policy

- `klynx-api` is the only writer.
- URL fields (`logoLightUrl`, `logoDarkUrl`, `faviconUrl`) are written **only** by the asset-upload endpoint. PATCH rejects these keys.
- Deletes to URL fields go through the asset-delete endpoint (idempotent).

---

## 4. Surface Summary

| Type | Name | Method / Path | Auth | Handler |
|---|---|---|---|---|
| REST | Get branding | `GET /kapi/system/configs/platform` | Bearer + `X-Active-Org` + Permify `organization.view` | `configapi.GetPlatformConfig` |
| REST | Patch branding | `PATCH /kapi/system/configs/platform` | Bearer + `X-Active-Org` + Permify `organization.manage` | `configapi.PatchPlatformConfig` |
| REST | Upload asset | `POST /kapi/system/configs/platform/asset` | Bearer + `X-Active-Org` + Permify `organization.manage` | `configapi.UploadPlatformAsset` |
| REST | Delete asset | `DELETE /kapi/system/configs/platform/asset/:variant` | Bearer + `X-Active-Org` + Permify `organization.manage` | `configapi.DeletePlatformAsset` |

**Middleware chain for every route above:** `AuthBearer` → `Audit` → `ActiveOrg` → handler. `ActiveOrg` hard-fails with 400 when `X-Active-Org` is missing, 401 when unauthenticated, 403 when the caller is not a member of the org.

---

## 4A. Authoritative Error Code Mapping

Top-level `code` always comes from `models/gmod/response.go` shared constants. Two classes of error exist:

- **Middleware-originated errors** (`AuthBearer`, `ActiveOrg`): top-level `code` + `message` **only**, no `details.reason`. The shared middleware is not modified in this phase. These responses are structurally identical to what every other `ActiveOrg`-guarded endpoint in the repo returns today.
- **Feature-layer errors** (this controller + `sysconfigsvc.*`): top-level `code` + `message` + `details.reason` sub-code, via `FailBadRequestReason` (or an equivalent reason helper). `details` may also include `details.field`, `details.detectedMime`, or `details.limitBytes` where useful for FE.

### Middleware-originated responses (no `details.reason`)

| HTTP | Top-level `code` | `message` (indicative) | Source | FE handling |
|---|---|---|---|---|
| 400 | `BAD_REQUEST` | `"X-Active-Org header required"` | `ActiveOrg` | ensure FE always sends `X-Active-Org` |
| 401 | `UNAUTHORIZED` | `"Unauthorized"` | `AuthBearer` / `ActiveOrg` | redirect to sign-in |
| 403 | `FORBIDDEN` | `"Forbidden"` | `ActiveOrg` (caller not an org member) | show generic "no access" state |
| 500 | `INTERNAL_ERROR` | `"authz check failed"` or similar | `ActiveOrg` (Permify down) | retry with backoff |

### Feature-layer responses (authoritative `details.reason` set)

| HTTP | Top-level `code` | `details.reason` | Raised by | Meaning |
|---|---|---|---|---|
| 400 | `BAD_REQUEST` | `no_patch_fields` | `PatchPlatformConfig` | PATCH body has no recognized fields |
| 400 | `BAD_REQUEST` | `invalid_name` | `PatchPlatformConfig` | name empty or > 64 chars after trim |
| 400 | `BAD_REQUEST` | `invalid_color` | `PatchPlatformConfig` | `primaryColor` does not match `^#[0-9a-fA-F]{6}$` |
| 400 | `BAD_REQUEST` | `invalid_locale` | `PatchPlatformConfig` | `defaultLocale` not in `th`/`en` |
| 400 | `BAD_REQUEST` | `invalid_theme` | `PatchPlatformConfig` | `defaultTheme` not in `light`/`dark`/`auto` |
| 400 | `BAD_REQUEST` | `invalid_variant` | upload/delete | `variant` path/form param not in allowlist |
| 400 | `BAD_REQUEST` | `missing_file` | upload | multipart missing `file` part |
| 400 | `BAD_REQUEST` | `mime_not_allowed` | upload | detected mime outside the per-variant allowlist; `details.detectedMime` included |
| 400 | `BAD_REQUEST` | `file_too_large` | upload | bytes > per-variant cap; `details.limitBytes` included |
| 403 | `FORBIDDEN` | `not_org_admin` | admin endpoints | caller is a member but lacks `organization.manage` (service-layer Permify check) |
| 500 | `INTERNAL_ERROR` | (optional; may be absent) | any | unexpected server error; FE should not depend on `reason` being set |

**Unknown keys in PATCH body** (e.g. `logoLightUrl`, `logoDarkUrl`, `faviconUrl`, `updatedAt`, or any other unrecognized field): **silently dropped** by `json.Unmarshal` into the typed DTO. No error, no reason. To clear an asset URL, use `DELETE /asset/:variant`. This matches the standard Go JSON behavior used elsewhere in the repo.

### FE disambiguation rule

```
if details.reason is present:
    → feature-layer error; switch on reason for inline UI handling
else:
    → middleware-originated error; switch on HTTP status + top-level `code`
```

Any `details.reason` value not listed above must be treated as an unknown error and surfaced generically.

---

## 5. REST Contract

### 5.1 Get Branding — any org member

**Endpoint:** `/kapi/system/configs/platform`
**Method:** `GET`
**Auth:** `Authorization: Bearer <jwt>`, `X-Active-Org: <orgId>`, Permify `organization:<orgId>#view@user:<userId>` (enforced by `middleware.ActiveOrg`).
**Purpose:** Return the resolved branding for the active org (merged with platform defaults for any unset field). Any authenticated org member is allowed — no admin gate.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | orgId scoping; missing → `400 BAD_REQUEST` (middleware-originated; no `details.reason` — see §4A) |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "platformNameTh": "คลิงซ์",
    "platformNameEn": "Klynx",
    "logoLightUrl": "https://aliza-s3.k-lynx.com/public/branding/9b0c7b62.../logoLight-7f3e2a.png",
    "logoDarkUrl": null,
    "faviconUrl": null,
    "primaryColor": "#2563eb",
    "defaultLocale": "th",
    "defaultTheme": "auto",
    "updatedAt": "2026-04-21T03:15:00Z"
  }
}
```

#### Success Field Definitions

| Field | Type | Nullable | Description |
|---|---|---|---|
| `platformNameTh` | string | no | Thai platform name; defaults to `"Klynx"` when unset |
| `platformNameEn` | string | no | English platform name; defaults to `"Klynx"` when unset |
| `logoLightUrl` | string | yes | Public S3 URL of the primary logo, or null |
| `logoDarkUrl` | string | yes | Public S3 URL of the dark-theme logo, or null |
| `faviconUrl` | string | yes | Public S3 URL of the favicon, or null |
| `primaryColor` | string | no | Hex `^#[0-9a-fA-F]{6}$`; defaults to `"#2563eb"` |
| `defaultLocale` | `"th"` \| `"en"` | no | defaults to `"th"` |
| `defaultTheme` | `"light"` \| `"dark"` \| `"auto"` | no | defaults to `"auto"` |
| `updatedAt` | RFC3339 UTC | no | last PATCH or asset change; `"1970-01-01T00:00:00Z"` when never set |

#### Error Contract

All errors on this endpoint are middleware-originated (see §4A). No `details.reason` is set.

| HTTP | code | Source | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `ActiveOrg` — missing `X-Active-Org` | ensure FE always sends the header |
| 401 | `UNAUTHORIZED` | `AuthBearer` — invalid token | redirect to sign-in |
| 403 | `FORBIDDEN` | `ActiveOrg` — caller not a member | show generic "no access" state |
| 500 | `INTERNAL_ERROR` | `ActiveOrg` or repo error | retry with backoff |

---

### 5.2 Patch Branding — admin / owner only

**Endpoint:** `/kapi/system/configs/platform`
**Method:** `PATCH`
**Auth:** Bearer + `X-Active-Org` + Permify `organization.manage` (service-layer).
**Purpose:** Partial update of branding text fields. Omitted fields are left unchanged. `null` is not permitted — asset URLs are cleared via the delete-asset endpoint.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | orgId scoping |
| `Content-Type` | yes | `application/json` |

#### Request Body

```json
{
  "platformNameTh": "คลิงซ์",
  "platformNameEn": "Klynx",
  "primaryColor": "#2563eb",
  "defaultLocale": "th",
  "defaultTheme": "auto"
}
```

#### Request Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `platformNameTh` | `*string` | no | klynx-api | 1–64 chars after trim |
| `platformNameEn` | `*string` | no | klynx-api | 1–64 chars after trim |
| `primaryColor` | `*string` | no | klynx-api | `^#[0-9a-fA-F]{6}$` |
| `defaultLocale` | `*string` | no | klynx-api | `th` \| `en` |
| `defaultTheme` | `*string` | no | klynx-api | `light` \| `dark` \| `auto` |

**Unknown keys** (including `logoLightUrl`, `logoDarkUrl`, `faviconUrl`, `updatedAt`, or any other unrecognized field): **silently dropped** by `json.Unmarshal` into the typed DTO. The server does not enforce rejection. URL fields can only be changed via the asset upload/delete endpoints because they are not part of the PATCH DTO — this is the real guard, not a validation error.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "updated",
  "status": true
}
```

#### Error Contract

Middleware-originated (no `details.reason` — see §4A):

| HTTP | code | Source | FE handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `ActiveOrg` — missing header | ensure `X-Active-Org` is set |
| 401 | `UNAUTHORIZED` | invalid token | redirect |
| 403 | `FORBIDDEN` | `ActiveOrg` — not a member | hide page |
| 500 | `INTERNAL_ERROR` | middleware or repo error | retry |

Feature-layer (`details.reason` set):

| HTTP | code | details.reason | Meaning | FE handling |
|---|---|---|---|---|
| 400 | `BAD_REQUEST` | `no_patch_fields` | empty body | show form-level error |
| 400 | `BAD_REQUEST` | `invalid_name` | name empty or too long; `details.field` = `platformNameTh` or `platformNameEn` | inline error on the field |
| 400 | `BAD_REQUEST` | `invalid_color` | regex fail; `details.field = "primaryColor"` | inline on `primaryColor` |
| 400 | `BAD_REQUEST` | `invalid_locale` | not in allowlist; `details.field = "defaultLocale"` | inline on `defaultLocale` |
| 400 | `BAD_REQUEST` | `invalid_theme` | not in allowlist; `details.field = "defaultTheme"` | inline on `defaultTheme` |
| 403 | `FORBIDDEN` | `not_org_admin` | member but not admin/owner | show "admin only" state |

#### Error Example

```json
{
  "code": "BAD_REQUEST",
  "message": "invalid primaryColor",
  "status": false,
  "details": {
    "reason": "invalid_color",
    "field": "primaryColor"
  }
}
```

---

### 5.3 Upload Asset — admin / owner only

**Endpoint:** `/kapi/system/configs/platform/asset`
**Method:** `POST`
**Auth:** Bearer + `X-Active-Org` + Permify `organization.manage`.
**Purpose:** Upload a branding asset (logo variant or favicon) to S3 and write its URL onto the branding doc. Response contains the persisted URL; FE can update local state without a second GET.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | orgId scoping |
| `Content-Type` | yes | `multipart/form-data` |

#### Form Data

| Field | Type | Required | Description |
|---|---|---|---|
| `variant` | string | yes | one of `logoLight`, `logoDark`, `favicon` |
| `file` | file | yes | binary content |

#### Asset Rules per Variant (Phase 1)

| Variant | Allowed MIME (detected server-side from bytes) | Max Size | Recommended Dimensions |
|---|---|---|---|
| `logoLight` | `image/png`, `image/jpeg`, `image/webp` | 2 MB | 512×512 max, transparent bg preferred |
| `logoDark` | `image/png`, `image/jpeg`, `image/webp` | 2 MB | same |
| `favicon` | `image/png`, `image/x-icon` | 512 KB | 32×32 or 64×64 |

SVG is intentionally **excluded** in Phase 1. See plan §12.

**Server behavior:**
- Mime is detected from the file bytes; `filename` extension is ignored.
- Object-key extension is derived from the detected mime: `png`→`png`, `jpeg`→`jpg`, `webp`→`webp`, `x-icon`→`ico`.
- Object key: `branding/<orgId>/<variant>-<uuid>.<ext>`.
- Upload call: `s3.Upload(ctx, "public", true, objectKey, bytes, contentType)`. Returned URL: `<S3_BASE_URL>/public/<objectKey>`.
- After Mongo patch succeeds, the previous object for the same variant is deleted via `s3.DeleteByURL(previousUrl)` in a goroutine — best-effort, non-fatal.
- Service emits a structured log entry `platformAssetUpload` with `{orgId, variant, objectKey, bytes, actorId, traceId}`.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "uploaded",
  "status": true,
  "details": {
    "variant": "logoLight",
    "url": "https://aliza-s3.k-lynx.com/public/branding/9b0c7b62.../logoLight-7f3e2a.png"
  }
}
```

#### Error Contract

Middleware-originated (no `details.reason`):

| HTTP | code | Source |
|---|---|---|
| 400 | `BAD_REQUEST` | `ActiveOrg` — missing header |
| 401 | `UNAUTHORIZED` | invalid token |
| 403 | `FORBIDDEN` | `ActiveOrg` — not a member |
| 500 | `INTERNAL_ERROR` | middleware or infra error |

Feature-layer (`details.reason` set):

| HTTP | code | details.reason | Meaning |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `invalid_variant` | variant not in allowlist |
| 400 | `BAD_REQUEST` | `missing_file` | no `file` part |
| 400 | `BAD_REQUEST` | `mime_not_allowed` | detected mime not in per-variant allowlist; `details.detectedMime` included |
| 400 | `BAD_REQUEST` | `file_too_large` | bytes > cap; `details.limitBytes` included |
| 403 | `FORBIDDEN` | `not_org_admin` | member but not admin/owner |
| 500 | `INTERNAL_ERROR` | (optional; may be absent) | S3 upload or Mongo patch failed |

---

### 5.4 Delete Asset — admin / owner only

**Endpoint:** `/kapi/system/configs/platform/asset/:variant`
**Method:** `DELETE`
**Auth:** Bearer + `X-Active-Org` + Permify `organization.manage`.
**Purpose:** Clear the URL for a variant on the branding doc and remove the S3 object best-effort. Idempotent.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `variant` | string | yes | one of `logoLight`, `logoDark`, `favicon` |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "deleted",
  "status": true
}
```

Server behavior:
- If the variant URL is already empty, respond 200 immediately (idempotent).
- Mongo patch-to-null happens first; then `s3.DeleteByURL(previousUrl)` fires in a goroutine (best-effort; log-only on error).
- Service emits a structured log `platformAssetDelete` with `{orgId, variant, previousObjectKey, actorId, traceId}`.

#### Error Contract

Middleware-originated (no `details.reason`):

| HTTP | code | Source |
|---|---|---|
| 400 | `BAD_REQUEST` | `ActiveOrg` — missing header |
| 401 | `UNAUTHORIZED` | invalid token |
| 403 | `FORBIDDEN` | `ActiveOrg` — not a member |
| 500 | `INTERNAL_ERROR` | middleware or infra error |

Feature-layer (`details.reason` set):

| HTTP | code | details.reason | Meaning |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `invalid_variant` | path param not in allowlist |
| 403 | `FORBIDDEN` | `not_org_admin` | member but not admin/owner |
| 500 | `INTERNAL_ERROR` | (optional; may be absent) | Mongo patch failed |

---

## 6. Event Contract

N/A — no events.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `klynx-api`
- Store: `options` collection, doc `_id = "system.setting.<orgId>"`
- Canonical fields added to `OrgStreamSetting` (all pointers, nil = inherit platform default):
  - `platformNameTh *string`
  - `platformNameEn *string`
  - `logoLightUrl *string`
  - `logoDarkUrl *string`
  - `faviconUrl *string`
  - `primaryColor *string`
  - `defaultLocale *string` (`"th"` \| `"en"`)
  - `defaultTheme *string` (`"light"` \| `"dark"` \| `"auto"`)
  - (existing) `UpdatedAt time.Time`

Binaries live in S3 public bucket (`config.S3PublicBuckets["public"]`); the doc holds only URLs.

### Projection Store

None.

### Field Mapping

| Canonical Field | Consumer (FE) | Transform |
|---|---|---|
| `platformNameTh` \| default | `platformNameTh` | server resolves default |
| `platformNameEn` \| default | `platformNameEn` | server resolves default |
| `logoLightUrl` | `logoLightUrl` | identity |
| `logoDarkUrl` | `logoDarkUrl` | identity |
| `faviconUrl` | `faviconUrl` | identity |
| `primaryColor` \| default | `primaryColor` | FE writes to CSS custom property |
| `defaultLocale` \| default | `defaultLocale` | applied only when user has no explicit locale |
| `defaultTheme` \| default | `defaultTheme` | applied only when user has no explicit theme |

---

## 8. Field Ownership

N/A — single writer (`klynx-api`).

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Root layout / header / menu (authenticated) | `GET /system/configs/platform` | all fields | called on shell mount, cached per session |
| `/settings/platform` page (admin/owner) | `GET/PATCH /system/configs/platform` | all / PATCH body | GET is allowed for all members; hide form / disable actions when PATCH would 403 |
| Logo/favicon upload on `/settings/platform` | `POST /system/configs/platform/asset` | `variant`, `file` | preview returned `url` immediately; don't re-fetch |
| Asset delete on `/settings/platform` | `DELETE /system/configs/platform/asset/:variant` | path param | confirm dialog recommended |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `form.platformNameTh` | `platformNameTh` | request (PATCH) | trim client-side before submit |
| `form.primaryColor` | `primaryColor` | request (PATCH) | must match `^#[0-9a-fA-F]{6}$` |
| `logoFile` | `file` (multipart) | request (POST asset) | client pre-check mime + size; server re-validates |
| `variantSelect` | `variant` (multipart or path) | request (POST / DELETE asset) | `logoLight` \| `logoDark` \| `favicon` |
| `response.details.url` | `logoLightUrl` / `logoDarkUrl` / `faviconUrl` | response (POST asset) | write to local brand store |

### FE Guardrails

- Do not guess undocumented fields; any unexpected response key is opaque.
- Do not attempt to set `logoLightUrl` / `logoDarkUrl` / `faviconUrl` via PATCH — the server silently drops them (they are not part of the PATCH DTO). Use `POST /asset` to set and `DELETE /asset/:variant` to clear.
- Do not send `null` on PATCH; omit the field instead.
- **No pre-auth fetch in Phase 1.** Calling the branding endpoint without `Authorization` + `X-Active-Org` is a contract violation and will 400/401.
- Render image URLs via `<img src="...">`; never inline-fetch or eval.
- Apply primary color only through a sanitized CSS custom property — never interpolate the value into style attributes or raw CSS strings.
- **Error disambiguation (authoritative):** check `details.reason` presence first. If set → feature-layer error; switch on `reason` for inline UI. If absent → middleware-originated error; switch on HTTP status + top-level `code` and show a generic message. Do not expect a `reason` on 401s, on middleware 400/403, or on any 500.
- Treat the mapping in §4A + §5.x as complete; any other `code`/`reason` value is a bug and should surface generically.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | none | phase 1 | ships backend + contract |
| `klynx-feature` | `klynx-api` deployed on staging | phase 1 FE | endpoints live before FE starts |

---

## 11. Examples

### Example GET Success

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "platformNameTh": "Klynx",
    "platformNameEn": "Klynx",
    "logoLightUrl": null,
    "logoDarkUrl": null,
    "faviconUrl": null,
    "primaryColor": "#2563eb",
    "defaultLocale": "th",
    "defaultTheme": "auto",
    "updatedAt": "1970-01-01T00:00:00Z"
  }
}
```

### Example PATCH Request

```json
{
  "platformNameTh": "ระบบติดตาม Acme",
  "platformNameEn": "Acme Surveillance",
  "primaryColor": "#0ea5e9",
  "defaultLocale": "th",
  "defaultTheme": "auto"
}
```

### Example PATCH Success

```json
{
  "code": "SUCCESS",
  "message": "updated",
  "status": true
}
```

### Example PATCH 403 (member but not admin)

```json
{
  "code": "FORBIDDEN",
  "message": "org admin or owner required",
  "status": false,
  "details": {
    "reason": "not_org_admin"
  }
}
```

### Example Upload (multipart)

```
POST /kapi/system/configs/platform/asset HTTP/1.1
Authorization: Bearer <jwt>
X-Active-Org: 9b0c7b62-...
Content-Type: multipart/form-data; boundary=----X

------X
Content-Disposition: form-data; name="variant"

logoLight
------X
Content-Disposition: form-data; name="file"; filename="logo.png"
Content-Type: image/png

<binary>
------X--
```

### Example Upload Success

```json
{
  "code": "SUCCESS",
  "message": "uploaded",
  "status": true,
  "details": {
    "variant": "logoLight",
    "url": "https://aliza-s3.k-lynx.com/public/branding/9b0c7b62.../logoLight-7f3e2a.png"
  }
}
```

### Example Upload 400 — mime rejected

```json
{
  "code": "BAD_REQUEST",
  "message": "mime not allowed for this variant",
  "status": false,
  "details": {
    "reason": "mime_not_allowed",
    "detectedMime": "image/svg+xml"
  }
}
```

---

## 12. Checklist

- [x] Owner backend is explicit (`klynx-api`).
- [x] System of record is defined per domain.
- [x] Canonical store documented; no projection store.
- [x] Producers and consumers are listed.
- [x] Request, response, and error contracts are defined; error contract uses shared top-level codes with `details.reason` sub-codes.
- [x] Field ownership: N/A (single-writer).
- [x] Backward compatibility is documented (additive).
- [x] Replay / re-sync: N/A.
- [x] FE field mapping is included.
- [x] Rev-1 gaps closed: read auth = `organization.view`; write = `organization.manage`; `ActiveOrg` is strict; pre-auth deferred; error codes aligned; SVG deferred; S3 bucket key corrected to `"public"`.
- [x] Rev-2 gaps closed: middleware-originated errors documented as `code` + `message` only (no `details.reason`); shared middleware is not modified in this phase; `invalid_field` / rejected-keys semantics removed — unknown PATCH keys are silently dropped per standard Go JSON behavior; §4A split into "middleware-originated" and "feature-layer" with an explicit FE disambiguation rule.

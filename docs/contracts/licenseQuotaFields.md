# License Quota Fields Contract

**Date:** 2026-04-28
**Revision:** rev 3 — rev 2 closed B1–B3 (pointer-typed artifact fields, explicit v1+v2 verifier acceptance, PATCH guard); rev 3 closes B4 (artifactMeta quota fields are always present when `artifactMeta != null`; FE distinguishes "unlimited" from "capped" by value, not by presence).
**Status:** Approved by Codex — ready to implement
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/license-quota-fields-phase1.md](../plan/license-quota-fields-phase1.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v1 (this contract); license artifact bumps from `v1` → `v2`

---

## 1. Purpose

This contract defines the three commercial quota fields added to the enterprise license stack — `maxDevices`, `maxCustomers`, `maxLicensedUsers` — and the **read-only mirror semantics** that govern how those fields surface at every layer of the system (license record, signed artifact, deployment platform license).

- klynx-api publishes this contract; klynx-feature consumes it.
- FE must use the field names, types, and semantics defined here. FE must not invent additional fields and must not assume the values are independently editable on a deployment after activation.
- **Phase 1 scope is carry-through only.** No enforcement against actual resource counts. Enforcement is deferred to per-resource Phase 2 plans.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Per-customer commercial license terms | `klynx-api/licensesvc` | `enterprise_licenses` | New fields persist on `LicenseRecord`. |
| Signed license artifacts | `klynx-api/licensesvc` | `issued_artifacts` | One row per issuance/reissue; bytes are immutable once signed. |
| Activated platform state on a deployment | `klynx-api/licensesvc` | `platform_license` (singleton) | `ArtifactMeta` is the artifact-side projection on the deployment. |
| Effective entitlements visible to FE / runtime | `klynx-api/licensesvc` | `platform_license` (top-level) | Mirrored from `ArtifactMeta` at activation. |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST /admin/licenses` | `adminapi.LicenseRecordController` | klynx-feature backoffice | Accepts the three quota fields. |
| `PATCH /admin/licenses/:id` | `adminapi.LicenseRecordController` | klynx-feature backoffice | Accepts the three quota fields. |
| `POST /admin/platformLicense/activate` | `adminapi.PlatformActivationController` | deployment ops + klynx-feature deployment admin | Mirrors quotas from artifact into top-level platform license. |
| `GET /admin/platformLicense` | `adminapi.PlatformActivationController` | klynx-feature deployment admin | Surfaces the three fields at top-level and inside `artifactMeta`. |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Top-level `PlatformLicense.max*` | `platform_license` document fields | klynx-feature deployment admin | Read-only mirror of `ArtifactMeta.max*` once activated. |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive on the wire**, with a **documented semantic tightening** for the existing top-level `PlatformLicense.maxCustomers` / `maxLicensedUsers` fields (see §3.4).
- Consumer requirements: none. FE that does not send the new fields keeps working — server fills `-1`. FE that does not read the new fields keeps working — they are simply ignored.
- Deprecation window: n/a (no field is removed or renamed).

### Replay / Re-sync Behavior

- Activation is idempotent on `ArtifactMeta.RawPayloadHash`. Re-activating the same signed bytes is a no-op (existing behavior, unchanged).
- Reissue produces a new `IssuedArtifact` row. The deployment can re-activate at the operator's discretion.

### Write Authority Policy

- `LicenseRecord` (backoffice) is the authoritative writer for the three quota fields.
- The signed `LicenseArtifact` is an immutable transport.
- On a deployment, **only the activation flow writes** `ArtifactMeta.max*` and the top-level `PlatformLicense.max*` mirror. No other endpoint may mutate them.

### 3.4 Semantic Tightening of Top-Level Fields

Before this contract, `PlatformLicense.maxCustomers` and `maxLicensedUsers` were operator-controlled fields — written by `DefaultPlatformLicense()` at bootstrap and freely mutable via `PATCH /admin/platform/license`. After this contract:

- When `ArtifactMeta == nil` (no artifact has been activated): top-level fields hold the bootstrap defaults and remain freely editable via PATCH — same as before.
- When `ArtifactMeta != nil` (an artifact has been activated): top-level fields are an **effective projection mirrored from the artifact**, written through during `Activate`. They are **not a second source of truth**.
  - Activation flow is the only authoritative writer.
  - PATCH attempts that include `maxDevices`, `maxCustomers`, or `maxLicensedUsers` are rejected with `400 QUOTA_FIELDS_LOCKED_BY_ARTIFACT` (see §5.5). This is the contract's enforcement mechanism — without it, operator PATCHes would be silently overwritten on the next activation.
  - No code path outside `PlatformActivationService` may write these fields; this is enforced by the PATCH guard and verified by a pre-merge `grep` audit.

`maxDevices` is brand new; the same mirror rule applies from day one. Operators who need to change a quota on an artifact-activated deployment must re-issue the artifact (with the new quota values on the source `LicenseRecord`) and re-activate.

---

## 4. Surface Summary

| Type | Name | Method | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | Create license | `POST /admin/licenses` | platform admin | `adminapi.LicenseRecordController.Create` | klynx-feature backoffice |
| REST | Update license | `PATCH /admin/licenses/:id` | platform admin | `adminapi.LicenseRecordController.Update` | klynx-feature backoffice |
| REST | Activate platform license | `POST /admin/platformLicense/activate` | deployment admin | `adminapi.PlatformActivationController.Activate` | deployment ops |
| REST | Get current platform license | `GET /admin/platformLicense` | deployment admin | `adminapi.PlatformActivationController.GetCurrent` | klynx-feature deployment admin |
| REST | Update platform license policy (PATCH) | `PATCH /admin/platform/license` | platform admin | `adminapi.PlatformLicenseController.Update` | klynx-feature deployment admin / ops |

---

## 5. REST Contract

### 5.1 `POST /admin/licenses` (create license)

**Endpoint:** `/admin/licenses`
**Method:** `POST`
**Auth:** Bearer JWT, platform `administrator` role
**Purpose:** Create a per-customer enterprise license commercial record. Request shape gains three optional quota fields.

#### Request Body (additive fields shown; existing fields elided)

```json
{
  "customerAccountId": "istio",
  "deploymentType": "standalone",
  "deliveryMode": "appliance",
  "maxNodes": 1,
  "supportPlan": "24x7_4h",
  "features": { "...": "..." },
  "maxDevices": 1500,
  "maxCustomers": 1000,
  "maxLicensedUsers": 500
}
```

#### Request Field Definitions (new fields only)

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `maxDevices` | int | no | klynx-api | Cap on cameras in the Klynx camera collection. Default `-1` (unlimited) when absent. `0` is invalid. Phase 1 scope: cameras only — kcontrol/connector/edge are not counted. |
| `maxCustomers` | int | no | klynx-api | Cap on customer accounts allowed on the deployment. Default `-1` (unlimited) when absent. `0` is invalid. |
| `maxLicensedUsers` | int | no | klynx-api | Cap on licensed users (the Keycloak roles enumerated by the existing `countedPlatformRoles`). Default `-1` (unlimited) when absent. `0` is invalid. |

#### Success Response

**HTTP:** `201`

```json
{
  "code": "SUCCESS",
  "message": "...",
  "status": true,
  "details": {
    "...": "...",
    "maxDevices": 1500,
    "maxCustomers": 1000,
    "maxLicensedUsers": 500
  }
}
```

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `maxDevices`, `maxCustomers`, or `maxLicensedUsers` is `0`, or is a negative value other than `-1` | Show field-level error: "Use -1 for unlimited or a positive integer." |
| 401 | `UNAUTHORIZED` | unchanged | unchanged |
| 409 | `CONFLICT` | unchanged (1 active license per customer) | unchanged |

---

### 5.2 `PATCH /admin/licenses/:id` (update license)

Same three new fields, all optional pointer-typed (`*int`). Absent → no change. `null` → no change. Number → updated. `0` → 400 BAD_REQUEST. Negative number other than `-1` → 400 BAD_REQUEST.

```json
{
  "maxDevices": 2000
}
```

Response shape mirrors §5.1 success.

---

### 5.3 `POST /admin/platformLicense/activate` (activate signed artifact on deployment)

**Endpoint:** `/admin/platformLicense/activate`
**Method:** `POST`
**Auth:** Bearer JWT, deployment admin
**Purpose:** Validate and apply a signed license artifact. Behavior is unchanged except that the resulting `ArtifactMeta` and top-level `PlatformLicense.max*` carry the three new fields when the artifact had them.

#### Request

Unchanged. Body is the signed artifact bytes wrapped in `{ "artifact": <bytes> }`.

#### Compatibility — `artifactVersion` semantics

| `payload.artifactVersion` | Behavior |
|---|---|
| `1` (legacy) | Verifies. Resulting `ArtifactMeta` has the three quota fields **defaulted to `-1`**. Top-level `PlatformLicense.max*` mirror = `-1` for all three. |
| `2` (this revision) | Verifies. Resulting `ArtifactMeta` carries either explicit values (`artifact.maxX > 0`) or `-1` (`artifact.maxX` absent / pointer was nil at issue time). Top-level `PlatformLicense.max*` = same values. |
| anything else | `400 UNSUPPORTED_VERSION`. **Implementation note:** `validateArtifactStructure` currently does strict `payload.ArtifactVersion == CurrentArtifactVersion`; this contract requires changing it to `payload.ArtifactVersion ∈ {1, 2}`. Without that change, bumping `CurrentArtifactVersion` to `2` would break every previously-issued v1 artifact (Codex blocker B2). |

> **Why both versions verify with the same code:** the canonical serializer (`MarshalForSigning`) is `json.Marshal` on the `LicenseArtifact` struct. The three new fields are typed **`*int`** with `json:",omitempty"` on the artifact payload struct. Issuer rule: when the source `LicenseRecord.MaxX == -1` (unlimited / default), the issuer leaves the artifact pointer `nil`, and `omitempty` drops the field from the JSON bytes entirely. A v1 artifact (which has no such fields in its bytes) unmarshals into the v2 struct with all three pointers `nil`; re-marshalling under the same canonical serializer produces a JSON byte sequence with no quota keys — **byte-identical to the original v1 stream**. Signature verification therefore succeeds without any version-dispatch in the verifier path.
>
> The `*int` choice is what makes this work. A plain `int` with `json:",omitempty"` only omits the value `0`, not `-1` — so a v2 round-trip with a "default" `LicenseRecord.MaxX = -1` would emit `"maxX":-1` in the bytes, diverging from the v1 byte stream and forcing a version-dispatched verifier. Pointer-with-omitempty is the cheapest way to keep one verifier code path covering both versions.

#### Implementation requirements (verifier)

- `validateArtifactStructure` must accept `payload.ArtifactVersion ∈ {1, 2}`. The strict `==` check that exists today is incorrect for this contract.
- `ed25519.Verify` over `MarshalForSigning(payload)` — unchanged. Pointer-with-omitempty makes this byte-stable.
- After a successful `Verify`, the activation flow normalizes the pointers to `int` values for `ArtifactMeta`:
  ```
  meta.MaxDevices       = (signed.Payload.MaxDevices       == nil) ? -1 : *signed.Payload.MaxDevices
  meta.MaxCustomers     = (signed.Payload.MaxCustomers     == nil) ? -1 : *signed.Payload.MaxCustomers
  meta.MaxLicensedUsers = (signed.Payload.MaxLicensedUsers == nil) ? -1 : *signed.Payload.MaxLicensedUsers
  ```

#### Success Response

**HTTP:** `200`. Body shape unchanged at top level. The `details.platformLicense.artifactMeta` block now carries the three quota fields:

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "platformLicense": {
      "maxCustomers": 1000,
      "maxLicensedUsers": 500,
      "maxDevices": 1500,
      "artifactMeta": {
        "...": "...",
        "maxDevices": 1500,
        "maxCustomers": 1000,
        "maxLicensedUsers": 500,
        "signedBy": "Klynx Platform"
      }
    }
  }
}
```

(Top-level `maxDevices` is the only newly-added top-level field on `PlatformLicense`. `maxCustomers` and `maxLicensedUsers` already existed at the top level; their semantic is now the activation-mirror per §3.4.)

#### Error Contract

Unchanged from existing contract.

---

### 5.4 `GET /admin/platformLicense` (read current platform license)

**Endpoint:** `/admin/platformLicense`
**Method:** `GET`
**Auth:** Bearer JWT, deployment admin
**Purpose:** Return the currently activated platform license. Response carries the three quota fields at top level (always) and inside `artifactMeta` (always present whenever `artifactMeta` itself is non-null; values default to `-1` for legacy v1 artifacts and for v2 artifacts whose issuer left the pointer nil).

#### Success Response

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "licenseMode": "enterprise",
    "maxCustomers": 1000,
    "maxLicensedUsers": 500,
    "maxDevices": 1500,
    "countedPlatformRoles": ["administrator", "user"],
    "countDisabledUsers": false,
    "countServiceAccounts": false,
    "selfServiceCustomerCreationEnabled": true,
    "selfServiceOrgCreationEnabled": true,
    "artifactMeta": {
      "licenseId": "10e48b07-44d6-4c7c-89b7-7c29d1c036b0",
      "customerAccountId": "istio",
      "edition": "enterprise",
      "deploymentType": "standalone",
      "deliveryMode": "appliance",
      "maxNodes": 1,
      "maxDevices": 1500,
      "maxCustomers": 1000,
      "maxLicensedUsers": 500,
      "maintenanceStartDate": "2026-04-28T00:00:00Z",
      "maintenanceEndDate": "2030-12-31T00:00:00Z",
      "supportPlan": "24x7_4h",
      "features": { "...": "..." },
      "artifactVersion": 2,
      "issuedAt": "2026-04-28T10:29:19.248Z",
      "activatedAt": "2026-04-28T10:30:29.764Z",
      "signatureKeyId": "license-key-default",
      "signedBy": "Klynx Platform",
      "source": "artifact",
      "rawPayloadHash": "..."
    },
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

#### Success Field Definitions (new fields only)

| Field | Type | Description |
|---|---|---|
| `details.maxDevices` | int | Always present. `-1` means unlimited. Mirrored from `details.artifactMeta.maxDevices` when an artifact is active; otherwise the bootstrap default (`-1`). |
| `details.maxCustomers` | int | Always present. Same mirror semantic as `maxDevices`. **Note:** this field already existed; its semantic is now the activation mirror — see §3.4. |
| `details.maxLicensedUsers` | int | Always present. Same mirror semantic. Same note as `maxCustomers`. |
| `details.artifactMeta.maxDevices` | int | **Always present whenever `details.artifactMeta` itself is non-null.** `-1` means the signed artifact carried no cap (either a v1 artifact that pre-dated this field, or a v2 artifact whose issuer left the pointer nil). Positive int means an explicit cap was carried on the artifact. |
| `details.artifactMeta.maxCustomers` | int | Same presence rule as `artifactMeta.maxDevices`. |
| `details.artifactMeta.maxLicensedUsers` | int | Same presence rule. |
| `details.artifactMeta.artifactVersion` | int | Bumped to `2` for newly-issued artifacts. Existing v1 artifacts continue to carry `1`. |

> **Mirror semantic in plain English:** the top-level `details.maxDevices` is what the deployment effectively enforces (Phase 2). When an admin reads the response, they should always trust the top-level value as the live cap. The `details.artifactMeta.max*` block exists for audit ("what did the activated artifact say"). The two will be equal whenever an artifact is active.
>
> **Presence vs. value:** field presence is **not** the provenance signal. `artifactMeta.maxDevices == -1` is what the wire shape uses to mean "the signed artifact did not carry an explicit cap" — whether because the artifact is v1 (no such field existed) or because the v2 issuer chose nil for that field. FE must decide "unlimited vs. capped" by reading the **value**, not by checking field presence. If a future revision needs to surface "this came from the artifact vs. defaulted on the deployment", that should be added as an explicit boolean / source field, not inferred from `omitempty`.

#### Error Contract

Unchanged.

---

### 5.5 `PATCH /admin/platform/license` (operator policy update — quota fields newly guarded)

**Endpoint:** `/admin/platform/license`
**Method:** `PATCH`
**Auth:** Bearer JWT, platform `administrator` role
**Purpose:** The pre-existing endpoint that lets a deployment operator tune platform policy. This contract revision adds an artifact-locked guard for the three quota fields — they remain freely editable while no artifact is activated, and become 400-locked once an artifact is in place.

#### Request Body (additive: `MaxDevices`; existing fields unchanged)

```json
{
  "licenseMode": "saas",
  "maxCustomers": 1000,
  "maxLicensedUsers": 500,
  "maxDevices": 1500,
  "countDisabledUsers": false,
  "countServiceAccounts": false,
  "selfServiceCustomerCreationEnabled": true,
  "selfServiceOrgCreationEnabled": true,
  "countedPlatformRoles": ["administrator", "user"]
}
```

All fields remain optional / pointer-typed (`null` or absent = no change for that field).

#### Behaviour Matrix

| `PlatformLicense.ArtifactMeta` | Body contains `maxDevices` / `maxCustomers` / `maxLicensedUsers` | Result |
|---|---|---|
| `nil` (no artifact activated) | yes | accepted; written through to the doc — same as today |
| `nil` | no | accepted; other policy fields applied — same as today |
| `!= nil` (artifact activated) | yes (any of the three) | **rejected** with `400 QUOTA_FIELDS_LOCKED_BY_ARTIFACT`; no fields are written |
| `!= nil` | no | accepted; non-quota policy fields applied normally |

The locking is whole-request: if any forbidden field is present in the body and the lock is active, the entire PATCH fails — partial writes are never produced. This is intentional; partial success would silently drop the operator's intent.

#### Error Contract (additions only)

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `QUOTA_FIELDS_LOCKED_BY_ARTIFACT` | The deployment has an activated artifact (`ArtifactMeta != nil`) and the request attempts to mutate `maxDevices`, `maxCustomers`, or `maxLicensedUsers`. The error message names which field(s) triggered the lock. | FE must hide / disable these inputs when the activated state is shown, and direct the operator to re-issue + re-activate an artifact in order to change a quota. |

#### Error Example

```json
{
  "code": "QUOTA_FIELDS_LOCKED_BY_ARTIFACT",
  "message": "maxCustomers is mirrored from the activated artifact and cannot be edited via this endpoint",
  "status": false
}
```

---

## 6. Event Contract

Not applicable — REST only.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `klynx-api/licensesvc`
- Stores: `enterprise_licenses` (per-customer record), `issued_artifacts` (signed bytes), `platform_license` (per-deployment singleton)
- Canonical fields: the three quota fields on `LicenseRecord`.

### Projection Store

- System: `klynx-api/licensesvc` (deployment-side)
- Store: `platform_license` document — top-level `max*` fields are the projection of `ArtifactMeta.max*`.

### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `LicenseRecord.maxDevices` | `LicenseArtifact.maxDevices` (signed) → `ArtifactMeta.maxDevices` (deployment) → top-level `PlatformLicense.maxDevices` | `details.maxDevices` and `details.artifactMeta.maxDevices` | Mirror written at activation. |
| `LicenseRecord.maxCustomers` | same chain | same | Same. |
| `LicenseRecord.maxLicensedUsers` | same chain | same | Same. |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `LicenseRecord.maxDevices` | `licensesvc.LicenseRecordService` | platform admin | `enterprise_licenses` | Editable via `PATCH /admin/licenses/:id`; reissue + re-activate to propagate to a deployment. |
| `LicenseArtifact.maxDevices` | `licensesvc.LicenseIssuerService` | issuance only | `issued_artifacts` row | Immutable after sign. **Type:** `*int` (pointer) — issuer leaves it `nil` when source value is `-1`, omitting it from the signed bytes (see §5.3 byte-stability proof). |
| `ArtifactMeta.maxDevices` | `licensesvc.PlatformActivationService` | activation only | `platform_license` doc | Replaced wholesale on each activation. **Type:** `int`. Activation normalizes `nil` artifact pointer → `-1` here. |
| top-level `PlatformLicense.maxDevices` | `licensesvc.PlatformActivationService` when `ArtifactMeta != nil`; otherwise operator via `PATCH /admin/platform/license` | activation flow OR (only when `ArtifactMeta == nil`) operator PATCH | `platform_license` doc | **PATCH guard:** when `ArtifactMeta != nil`, PATCH attempts on this field return `400 QUOTA_FIELDS_LOCKED_BY_ARTIFACT` — see §5.5 + §3.4. |
| `LicenseRecord.maxCustomers` / `maxLicensedUsers` | same as `maxDevices` row | same | same | same |
| top-level `PlatformLicense.maxCustomers` / `maxLicensedUsers` | same as top-level `maxDevices` (activation OR operator PATCH gated on `ArtifactMeta`) | same | `platform_license` doc | **Behavior change** — pre-contract, operator PATCH was unconditionally allowed. The PATCH guard tightens this — see §3.4 and §5.5. |

### Conflict Resolution

- The mirror is one-directional (issuer → artifact → activation → top-level). No bidirectional sync.
- A new activation overwrites the previous mirror values transactionally inside `UpsertArtifactMeta`.
- Replay: re-activating the same `RawPayloadHash` is a no-op.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Backoffice — create license | `POST /admin/licenses` | `maxDevices?`, `maxCustomers?`, `maxLicensedUsers?` | Three optional inputs, placeholder "-1 = unlimited". Reject `0` client-side or surface server's 400. |
| Backoffice — edit license | `PATCH /admin/licenses/:id` | same, all optional | Pointer-typed on the wire (`null` / absent = no change). |
| Deployment admin — view license | `GET /admin/platformLicense` | `details.maxDevices`, `details.maxCustomers`, `details.maxLicensedUsers` | Render alongside existing `maxNodes`. Use the **top-level** fields as the displayed value. `artifactMeta.max*` is for "show derivation" UI only. |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| Create form input "Max Devices" | `maxDevices` | request | empty → omit field → server defaults `-1`. |
| Detail row "Max Devices" | `details.maxDevices` | response | render `-1` as "Unlimited". Never render the literal `-1`. |
| Audit panel "Cap from artifact" | `details.artifactMeta.maxDevices` | response | always present when `artifactMeta != null`; render `-1` as "—" / "Unlimited", positive int as the cap. |

### FE Guardrails

- **Never** treat `details.maxCustomers`, `details.maxLicensedUsers`, or `details.maxDevices` as an editable field on the deployment admin page once `details.artifactMeta != null`. The backend now actively rejects such PATCHes with `QUOTA_FIELDS_LOCKED_BY_ARTIFACT`. FE should disable the inputs and surface a hint that re-activation is the only path to change a quota.
- **Never** render the literal `-1` to end-users. Show "Unlimited" or an em-dash.
- **Never** treat field presence on `artifactMeta.max*` as a provenance signal. Whenever `artifactMeta != null`, the three fields are always present. Distinguish "unlimited" from "capped" by reading the **value** (`-1` vs. positive int).
- Treat the documented error codes (`BAD_REQUEST`, `QUOTA_FIELDS_LOCKED_BY_ARTIFACT`) as the only supported error contract.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | model + service + controller changes | shipped first | Phase 1 only — additive. |
| `klynx-feature` | this contract | after klynx-api lands | Optional — backend works without FE changes. |

---

## 11. Examples

### Example Create Request

```json
{
  "customerAccountId": "istio",
  "deploymentType": "standalone",
  "deliveryMode": "appliance",
  "maxNodes": 1,
  "supportPlan": "24x7_4h",
  "features": { "sso": false, "advancedSecurity": false, "ai": false, "onPrem": true, "clusterMode": false },
  "maxDevices": 1500,
  "maxCustomers": 1000,
  "maxLicensedUsers": 500
}
```

### Example Create Request (no quotas — server defaults to `-1`)

```json
{
  "customerAccountId": "istio",
  "deploymentType": "standalone",
  "deliveryMode": "appliance",
  "maxNodes": 1,
  "supportPlan": "24x7_4h",
  "features": { "...": "..." }
}
```

→ persisted record has `maxDevices: -1, maxCustomers: -1, maxLicensedUsers: -1`.

### Example Validation Error

```json
{
  "code": "BAD_REQUEST",
  "message": "maxDevices must be -1 (unlimited) or a positive integer",
  "status": false
}
```

### Example `GET /admin/platformLicense` — v2 artifact active

(see §5.4)

### Example `GET /admin/platformLicense` — no artifact active (default state)

```json
{
  "code": "SUCCESS",
  "details": {
    "licenseMode": "saas",
    "maxCustomers": 1000,
    "maxLicensedUsers": 500,
    "maxDevices": -1,
    "artifactMeta": null
  }
}
```

### Example `GET /admin/platformLicense` — legacy v1 artifact active

A v1 artifact pre-dates the three quota fields, so the activation flow normalizes them to `-1`. The wire shape still includes the fields inside `artifactMeta` — FE reads `-1` as "unlimited / artifact carried no cap":

```json
{
  "code": "SUCCESS",
  "details": {
    "licenseMode": "enterprise",
    "maxCustomers": -1,
    "maxLicensedUsers": -1,
    "maxDevices": -1,
    "artifactMeta": {
      "licenseId": "...",
      "customerAccountId": "...",
      "edition": "enterprise",
      "deploymentType": "standalone",
      "deliveryMode": "appliance",
      "maxNodes": 1,
      "maxDevices": -1,
      "maxCustomers": -1,
      "maxLicensedUsers": -1,
      "supportPlan": "24x7_4h",
      "features": { "...": "..." },
      "artifactVersion": 1,
      "issuedAt": "...",
      "activatedAt": "...",
      "signatureKeyId": "license-key-default",
      "signedBy": "Klynx Platform",
      "source": "artifact",
      "rawPayloadHash": "..."
    }
  }
}
```

---

## 12. Checklist

- [x] Owner backend explicit (`klynx-api`).
- [x] System of record defined per domain.
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed.
- [x] Request, response, and error contracts defined (including new `QUOTA_FIELDS_LOCKED_BY_ARTIFACT`).
- [x] Field ownership and write authority documented; PATCH guard mechanism specified (§3.4 + §5.5).
- [x] Backward compatibility documented (additive on the wire; semantic tightening on top-level fields explicitly called out).
- [x] Replay / re-sync behavior documented (idempotent on `RawPayloadHash`).
- [x] FE field mapping included.
- [x] Artifact v1 / v2 verifier compatibility strategy documented — **pointer-typed quota fields with `json:",omitempty"`** is the byte-stability mechanism (§5.3).
- [x] Legacy default rule documented (`-1` for missing fields, normalized at read).
- [x] Top-level entitlement fields documented as "effective projection, not second SoT" — and the PATCH guard is the enforcement mechanism, not just a comment.
- [x] `validateArtifactStructure` change to accept `{1, 2}` is called out as a required implementation step (§5.3 implementation requirements).

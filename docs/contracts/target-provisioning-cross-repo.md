<!-- docs/contracts/target-provisioning-cross-repo.md -->
# Target Provisioning Cross-Repo Contract

**Date:** 2026-04-24
**Status:** v1 — shipped with [docs/plan/target-provisioning-cross-repo.md](../plan/target-provisioning-cross-repo.md) slice 1
**Scope:** klynx-api admin REST + gateway-api gRPC `phibek.target.v1.TargetService`. No Kafka changes, no persistence in klynx-api.

---

## 1. Cross-Repo Flow

```text
klynx-portal (Vue)
  └─ fetch /kapi/api/v1/workspaces/{workspaceId}/delivery-targets  [klynx JWT]
       │
       ▼  klynx-api  (controllers/deliverytargetapi)
       ├─ middleware.ActiveOrg  → sets c.Locals("activeOrg") after Permify organization.view
       ├─ resolveAndCheck       → verify org.workspaceId == path workspaceId
       │                          + (writes only) Permify organization.manage
       └─ phibekgw.Client.*     → gRPC to gateway-api
            │
            ▼  gateway-api  (internal/grpc/targetgrpc)
            ├─ sharedSecretInterceptor (GRPC_SHARED_SECRET via x-gw-token)
            ├─ WorkspaceLookup.GetByID → resolves tenantId server-side
            └─ targetsvc.TargetService.{Create|List|GetOne|Update|Delete}
                  └─ IsPlatformAdmin=true (klynx-api has already authorized the caller)
```

Shared-secret interceptor is the only authentication between the two processes. klynx-api MUST have already verified the klynx user + org binding before forwarding.

---

## 2. gRPC Surface — `phibek.target.v1.TargetService`

Registered on the same gRPC server as `phibek.workspace.v1.WorkspaceService` (co-located in `internal/grpc/workspacegrpc/server.go`). JSON codec `klynx-json`. Auth: `x-gw-token: $GRPC_SHARED_SECRET` metadata.

| RPC | Request | Response | Error codes |
|-----|---------|----------|-------------|
| `Create` | `CreateTargetRequest` | `CreateTargetResponse` | `InvalidArgument`, `NotFound` (workspace), `AlreadyExists` (name dup), `ResourceExhausted` (plan cap) |
| `List` | `ListTargetsRequest` | `ListTargetsResponse` | `NotFound` (workspace), `Internal` |
| `Get` | `GetTargetRequest` | `GetTargetResponse` | `InvalidArgument`, `NotFound` |
| `Update` | `UpdateTargetRequest` | `UpdateTargetResponse` | `InvalidArgument`, `NotFound`, `AlreadyExists` |
| `Delete` | `DeleteTargetRequest` | `DeleteTargetResponse` | `NotFound`, `FailedPrecondition` (TemplatesInUse populated) |

### 2.1 Message Types

```go
// DeliveryTargetView — redacted wire shape returned by Get / List / Create / Update.
// Secret fields never leave gw; *Set bool flags let the FE render "configured" state.
type DeliveryTargetView struct {
    TargetID    string           `json:"id"`
    WorkspaceID string           `json:"workspaceId"`
    TenantID    string           `json:"tenantId"`
    Name        string           `json:"name"`
    Type        string           `json:"type"`            // webhook | line | telegram | discord
    Mode        string           `json:"mode,omitempty"`  // "klynx" system-only; never created via this API
    Enabled     bool             `json:"enabled"`
    Config      TargetConfigView `json:"config"`
    CreatedBy   string           `json:"createdBy"`
    CreatedAt   string           `json:"createdAt"`       // RFC3339 UTC
    UpdatedAt   string           `json:"updatedAt"`       // RFC3339 UTC
}

type TargetConfigView struct {
    // webhook + discord
    URL              string            `json:"url,omitempty"`
    Headers          map[string]string `json:"headers,omitempty"`
    SigningEnabled   bool              `json:"signingEnabled"`
    SigningSecretSet bool              `json:"signingSecretSet"`
    TimeoutMs        int               `json:"timeoutMs,omitempty"`

    // line
    ChannelAccessTokenSet    bool     `json:"channelAccessTokenSet"`
    ChannelAccessTokenRefSet bool     `json:"channelAccessTokenRefSet"`
    To                       []string `json:"to,omitempty"`

    // telegram
    BotTokenSet bool   `json:"botTokenSet"`
    ChatID      string `json:"chatId,omitempty"`
}
```

### 2.2 Request shapes

```go
type CreateTargetRequest struct {
    WorkspaceID  string                `json:"workspaceId"`
    CallerUserID string                `json:"callerUserId"` // forwarded as CreatedBy on gw side
    Name         string                `json:"name"`
    Type         string                `json:"type"`
    Mode         string                `json:"mode,omitempty"`
    Enabled      *bool                 `json:"enabled,omitempty"`
    Config       authzmod.TargetConfig `json:"config"` // plaintext secrets IN; out-of-band via redacted View
}

type ListTargetsRequest struct {
    WorkspaceID string `json:"workspaceId"`
    Search      string `json:"search,omitempty"`
    Page        int    `json:"page,omitempty"`      // default 1
    PerPage     int    `json:"perPage,omitempty"`   // default 20, capped at 100
    SortField   string `json:"sortField,omitempty"` // createdAt | name | updatedAt
    SortOrder   string `json:"sortOrder,omitempty"` // asc | desc (default desc)
}

type UpdateTargetRequest struct {
    WorkspaceID  string                 `json:"workspaceId"`
    TargetID     string                 `json:"targetId"`
    CallerUserID string                 `json:"callerUserId"`
    Name         *string                `json:"name,omitempty"`
    Enabled      *bool                  `json:"enabled,omitempty"`
    Config       *authzmod.TargetConfig `json:"config,omitempty"` // partial — secrets preserved when empty
}

type DeleteTargetRequest struct {
    WorkspaceID  string `json:"workspaceId"`
    TargetID     string `json:"targetId"`
    CallerUserID string `json:"callerUserId"`
}

type DeleteTargetResponse struct {
    // Populated iff gw returns FailedPrecondition — contains the names of templates
    // still referencing the target so the UI can prompt the user to unlink first.
    TemplatesInUse []string `json:"templatesInUse,omitempty"`
}
```

### 2.3 Redaction guarantee

`DeliveryTargetView.Config` has **no field capable of carrying a secret value**. `signingSecret`, `channelAccessToken`, `channelAccessTokenRef`, `botToken` are represented as booleans only. klynx-api is a strict pass-through — the FE sees exactly what gw sent.

When updating a target, klynx-api MUST forward `Config` as-is. If a field is empty, gw's `mergeConfigPreservingSecrets` ([internal/services/targetsvc/targetSvc.go:161](../../../phibek/gateway-api/internal/services/targetsvc/targetSvc.go)) keeps the previous value, so the "show `●●●●● (set)` until user retypes" UX works unchanged.

---

## 3. klynx-api REST Surface

Base path: `/kapi/api/v1/workspaces/{workspaceId}/delivery-targets`

Registered only when `GW_GRPC_URI` is set (appliance / platform profile). Under `saas` profile the route group is not mounted — calls return 404.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/` | Bearer + `X-Active-Org` + Permify `organization.manage` | Body = `createRequest` (below). 201 on success. |
| `GET` | `/` | Bearer + `X-Active-Org` + Permify `organization.view` | Paginated list. Member-level access. |
| `GET` | `/{id}` | Bearer + `X-Active-Org` + Permify `organization.view` | Single target. |
| `PATCH` | `/{id}` | Bearer + `X-Active-Org` + Permify `organization.manage` | Partial update. |
| `DELETE` | `/{id}` | Bearer + `X-Active-Org` + Permify `organization.manage` | 200 on success; 409 `TARGET_IN_USE` with `details.templatesInUse[]` when referenced. |

`ActiveOrg` middleware validates `organization.view`; write handlers additionally call `organization.manage` in the controller layer.

### 3.1 Request bodies

```go
// POST /workspaces/:workspaceId/delivery-targets
type createRequest struct {
    Name    string                `json:"name"`
    Type    string                `json:"type"`             // webhook|line|telegram|discord
    Mode    string                `json:"mode,omitempty"`   // only "klynx" has meaning; system-reserved
    Enabled *bool                 `json:"enabled,omitempty"`
    Config  authzmod.TargetConfig `json:"config"`
}

// PATCH /workspaces/:workspaceId/delivery-targets/:id
type updateRequest struct {
    Name    *string                `json:"name,omitempty"`
    Enabled *bool                  `json:"enabled,omitempty"`
    Config  *authzmod.TargetConfig `json:"config,omitempty"`
}
```

### 3.2 Success envelopes

```jsonc
// GET one
{
  "code": "SUCCESS",
  "status": true,
  "message": "ok",
  "details": { /* DeliveryTargetView */ }
}

// GET list
{
  "code": "SUCCESS",
  "status": true,
  "message": "ok",
  "details": { "items": [ /* DeliveryTargetView */ ] },
  "pagination": { "page": 1, "perPage": 20, "totalRecords": 3, "totalPages": 1, "sortField": "createdAt", "sortOrder": "desc" }
}

// POST create
{
  "code": "SUCCESS",
  "status": true,
  "message": "delivery target created",
  "details": { /* CreateTargetResponse with .target */ }
}

// PATCH update
{ "code": "SUCCESS", "status": true, "message": "ok", "details": { /* UpdateTargetResponse */ } }

// DELETE
{ "code": "SUCCESS", "status": true, "message": "deleted" }
```

### 3.3 Error mapping

gRPC status → HTTP status (`controllers/deliverytargetapi/target.go:mapGrpcErr`):

| gRPC code | HTTP | `code` (envelope) |
|---|---|---|
| `InvalidArgument` | 400 | `BAD_REQUEST` |
| `Unauthenticated` | 401 | `UNAUTHORIZED` |
| `PermissionDenied` | 403 | `FORBIDDEN` |
| `NotFound` | 404 | `NOT_FOUND` |
| `AlreadyExists` | 409 | `CONFLICT` |
| `FailedPrecondition` | 409 | `TARGET_IN_USE` (with `details.templatesInUse[]`) |
| `ResourceExhausted` | 402 | `PLAN_LIMIT_EXCEEDED` |
| `Internal` / unknown | 500 | `INTERNAL_ERROR` |
| dial/timeout (non-grpc) | 502 | `INTERNAL_ERROR` — upstream unavailable |

Local klynx-api authz failures (missing locals, workspace-mismatch, missing manage) map to 401 / 403 / 500 before the gRPC call is attempted — see `controllers/deliverytargetapi/target_test.go` for the matrix.

---

## 4. Authorization Rules

### 4.1 klynx-api layer

1. `AuthBearer()` validates the klynx JWT and sets `userId`, `tenantId`.
2. `ActiveOrg()` validates `organization.view` on the active klynx org — any member may use this stack.
3. Controller `resolveAndCheck`:
   - Loads the klynx org from Mongo.
   - **Denies (403)** unless `org.workspaceId == {workspaceId path param}`.
   - For write handlers, additionally runs Permify `organization.manage@user:<userId>`.

### 4.2 gateway-api layer

1. `sharedSecretInterceptor` gates every RPC with `GRPC_SHARED_SECRET`. Empty secret = dev-mode bypass.
2. Handler calls `WorkspaceLookup.GetByID(workspaceId)` → resolves `tenantId`. Missing workspace → `NotFound`.
3. `targetsvc.TargetService.*` runs with `IsPlatformAdmin=true` — the per-user Permify check is skipped because klynx-api has already authorized the caller on the klynx side.

### 4.3 Attack-surface envelope

- klynx-api cannot call this API without a valid klynx JWT (middleware).
- A klynx user cannot escalate to a workspace that is not bound to any of their orgs — the workspace-to-org check is a string compare on the canonical `organization.workspaceId` field managed by gw provisioning.
- A klynx-api process cannot forge a phibek workspace because every call is followed by a server-side `WorkspaceLookup.GetByID` that reads gw's canonical store.

---

## 5. Idempotency, Conflict Resolution, and Audit

- **Create:** name uniqueness is per `(tenantId, workspaceId)` — duplicates → `AlreadyExists` (409).
- **Delete:** soft-blocked by `TargetInUseError`. Retry after unlinking or FE acceptance of cascade is out of scope for slice 1.
- **Update:** last-write-wins on `updatedAt`. Secret preservation is automatic (see §2.3).
- **Audit:** gw side records actor via `CreatedBy` (set from `CallerUserID`); no new klynx-side audit store.

---

## 6. Environment & Rollout Gating

| Env | Side | Effect |
|---|---|---|
| `GW_GRPC_URI` | klynx-api | required; when unset the proxy route group is not registered (`RegisterWorkspaceDeliveryTargetRoutes` is a no-op) |
| `GRPC_SHARED_SECRET` | both | attach `x-gw-token` metadata on klynx side; enforce on gw side. Empty = dev bypass. |
| `DEPLOYMENT_PROFILE` | klynx-api | `appliance`/`platform` register this route; `saas` does not (phibek runs out-of-process over webhook in that profile). |

No feature flag is planned — the feature is gated structurally.

---

## 7. Change History

- **v1 (2026-04-24):** Initial ship. See plan §10 for per-side checklist. All items complete except klynx-portal UI (follow-up).

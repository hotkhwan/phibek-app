<!-- .claude/rule/code-style.md -->
# Code Style & Architecture Rules

## Canonical Architecture

```text
HTTP:
router → middleware → controller → service
service → repo | gateways | messaging | configruntime

Async:
consumer/subscriber → extract trace → start span → service
service → repo | gateways | messaging | configruntime

Cross-cutting:
logger | traceutil | crypto/secretbox
```

All production flows must fit this model.

## Package Layout

```text
internal/
  infra/
    mongo/
    s3/
  repo/
    devicerepo/
    mediarepo/
    orgrepo/
  gateways/
  services/
```

Meaning:
- `infra/*` = low-level infra/persistence/storage helpers
- `repo/*` = domain repositories
- infra helpers are not domain repos
- service must go through repo/gateway/messaging, not infra helpers directly

## Dependency Rules

### Allowed

- router → middleware → controller → service
- service → repo
- service → gateways
- service → messaging
- service → configruntime
- repo → infra
- gateways → infra only when required internally

### Forbidden

- controller → repo/gateways/messaging/infra
- router → service/repo/infra
- middleware → service/repo/infra
- service → infra directly
- repo → service/gateways/messaging
- gateways → repo/controller
- messaging → repo/controller
- service imports `fiber` / `net/http`

Only service may orchestrate multiple dependencies.

## Boundary Rules

### Fiber boundary

`*fiber.Ctx` is allowed only in:
- router
- middleware
- controller

Inner layers must use `context.Context` only.

### Context contract

All public methods in service, repo, gateways, messaging, and request-scoped configruntime must accept `ctx context.Context` as the first argument.

Example:

```go
func (s *DeviceService) Update(ctx context.Context, req UpdateDeviceRequest) error
```

## Layer Responsibilities

### router

Allowed:
- register routes
- attach middleware
- wire handlers

Forbidden:
- business logic
- DB access
- transport publish logic
- importing `utils/traceutil` or `utils/httputil`

Route method guard pattern — declare allowed methods **before** the handler:

```go
r.All("/path", middleware.AllowMethods("GET", "POST"))
r.Get("/path", controller.List)
r.Post("/path", controller.Create)
```

Do **not** chain guard + handler in a single `r.All(...)` call.

### middleware

Allowed:
- validate JWT/cookie
- validate org context
- set `c.Locals(...)`
- attach trace/audit metadata
- reject invalid requests early

May call only security/boundary gateways required for admission.

Forbidden:
- business workflow
- repo access
- arbitrary integration calls
- direct infra access

### controller

Allowed:
- parse params/query/body
- validate request shape
- map DTO ↔ service input/output
- call service
- map service errors to HTTP response

Forbidden:
- workflow/business decisions
- direct repo/gateway/messaging/infra calls
- retry/orchestration logic
- using `otel.Tracer(...).Start(...)` directly

Controller tracing and response pattern:

```go
func MyHandler(c *fiber.Ctx) error {
    ctx, end, log := traceutil.StartLite(c.UserContext(), "github.com/pointitconsulting/klynx-api/myapi", "myapi.MyHandler", "myapi", "MyHandler")
    defer end()

    // parse, validate ...

    result, err := mysvc.DoSomething(ctx, input)
    if err != nil {
        log.Error().Err(err).Msg("failed")
        return httputil.FailInternal(c, err.Error())
    }
    return httputil.Ok(c, result)
}
```

Use `traceutil.Start` (returns `span`) when span attributes must be set. Prefer `StartLite` otherwise.

### service

Owns:
- business rules
- workflow orchestration
- consistency decisions
- permission decisions
- retry/compensation policy
- domain error mapping

Forbidden:
- importing Fiber
- writing HTTP responses
- raw DB / raw HTTP / raw Kafka / raw MQTT logic inline
- calling `internal/infra/mongo` or `internal/infra/s3` directly

Service tracing pattern — start a child span at the top of every public function:

```go
func DoSomething(ctx context.Context, input Input) (*Result, error) {
    ctx, end, log := traceutil.StartLite(
        ctx,
        "github.com/pointitconsulting/klynx-api/mysvc",
        "mysvc.DoSomething",
        "mysvc", "DoSomething",
    )
    defer end()
    // log is already bound to traceId
    // pass ctx to every repo/gateway call
}
```

### repo

Persistence only.

Allowed:
- queries
- writes
- pagination/sort/filter/projection
- wrapped storage errors
- use of `internal/infra/mongo`

Forbidden:
- business workflow
- calling service/gateway/messaging
- reading `*fiber.Ctx`

Rules:
- regex queries must use `regexp.QuoteMeta()`
- indexes are managed centrally
- timestamps crossing boundaries use RFC3339 UTC

### gateways

`internal/gateways/*` = outbound integration adapters only.

Allowed:
- HTTP/gRPC/SDK calls
- payload mapping
- wrapped integration errors
- trace propagation via `traceutil.InjectHeaders` on every outbound HTTP request
- context-aware logging via `logger.FromCtx`

Forbidden:
- domain workflow
- calling repo
- writing API responses
- using `*fiber.Ctx`

Gateway outbound HTTP trace pattern:

```go
func (c *Client) doGET(ctx context.Context, path string, q url.Values) (...) {
    log := logger.FromCtx(ctx, "mygw", "GET "+path)
    req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
    for k, v := range traceutil.InjectHeaders(ctx, nil) {
        req.Header.Set(k, v)
    }
    // ...
}
```

### messaging

Transport adapter only.

Allowed:
- publish/consume mechanics
- serialization boundary
- topic routing
- trace inject/extract
- transport-level retry/backoff

Forbidden:
- business workflow
- calling repo/controller
- deciding business policy

There must be exactly one publish path per transport:
- Kafka publish in Kafka adapter only
- MQTT publish in MQTT adapter only
- no duplicate publish helpers in `config`, `utils`, or services

Kafka consumer trace pattern — extract parent span, start child span, pass ctx to service:

```go
kafka.StartConsumerWithHeaders(broker, topic, groupID, func(msg MyEvent, headers map[string]string) error {
    // 1) restore parent span from producer headers
    parentCtx := traceutil.ExtractHeaders(context.Background(), headers)
    // 2) start child span — do NOT use otel.Tracer() directly
    ctx, end, log := traceutil.StartLite(parentCtx, "klynx.mycons", "topic.consume", "mycons", "handler")
    defer end()
    // log is bound to traceId; pass ctx to service
    return mysvc.Handle(ctx, msg)
})
```

### configruntime

Read-only runtime dependency for service.

Rules:
- initialized once in bootstrap/container
- injected, not global
- may use TTL cache
- fault-tolerant on config read failure
- not for secrets
- not a business layer
- not a persistence layer

## Pragmatic DI Rules

Full DI is not required everywhere.

DI first where it matters:
- service → repo
- service → gateways
- service → messaging
- service → configruntime

Full DI is optional for:
- pure helpers
- mappers
- formatters
- validators without external dependencies

Migration rules:
- do not stop the whole project for full DI refactor
- new service code must not call infra helpers directly
- new flows must go through repo/gateway/messaging
- legacy package-style code may remain temporarily
- migrate old hot paths incrementally

## Domain Ownership Rules

Choose repo by data ownership, not by caller package.

### Example: read camera to get `rtspUrl`

Owner = camera/device domain.

Therefore:
- use `devicerepo`
- do not create this in `mediarepo`
- do not let `mapsvc` call mongo helper directly

Preferred methods:

```go
FindCameraForStream(ctx context.Context, orgId, cameraId string) (*devicemod.Camera, error)
```

or a narrower use-case DTO:

```go
GetRtspSource(ctx context.Context, orgId, cameraId string) (*CameraRtspSource, error)
```

Prefer the narrower method when only stream source fields are needed.

## Async Entrypoint Rules

Kafka consumers and MQTT subscribers follow the same contract as controllers:

```text
entrypoint → extract trace → start span → service
```

Forbidden:
- calling repo directly for workflow
- embedding business orchestration in callbacks
- skipping trace extraction when transport supports it

## Observability

### Logging

Request/message flow must use:

```go
logger.FromCtx(ctx, component, source)
```

Boot/static logger is for startup and non-request initialization only.

Avoid duplicate logs across layers for the same failure.

### Tracing

#### Tracing utilities (`utils/traceutil`)

| Function | Returns | Use when |
|---|---|---|
| `traceutil.StartLite` | `(ctx, end(), log)` | controller / service / webhook / consumer (preferred) |
| `traceutil.Start` | `(ctx, span, log)` | when span attributes/events must be set |
| `traceutil.StartScope` | `*Scope` | service methods that need timer or sub-scope |
| `traceutil.InjectHeaders` | `map[string]string` | inject trace into outbound Kafka/HTTP headers |
| `traceutil.ExtractHeaders` | `ctx` | extract trace from incoming Kafka/HTTP headers |
| `traceutil.DetachWithParent` | `ctx` | fire-and-forget goroutines |

#### Full tracing loop

```text
controller  →  traceutil.StartLite / Start        →  span starts, log bound
    ↓ ctx
service     →  traceutil.StartLite                →  child span, log bound
    ↓ ctx
repo        →  logger.FromCtx(ctx, ...)            →  log carries traceId
gateway     →  logger.FromCtx  +  traceutil.InjectHeaders(ctx, nil) → req.Header
kafka pub   →  kafka.PublishEventTo(ctx, ...)      →  InjectHeaders inside producer
kafka sub   →  traceutil.ExtractHeaders(bg, hdrs)  →  traceutil.StartLite  →  span restored
mqtt sub    →  traceutil.ExtractHeaders(bg, hdrs)  →  traceutil.StartLite  →  span restored
```

Rules:
- controller starts inbound span — use `traceutil.StartLite` or `traceutil.Start`
- service starts child span — use `traceutil.StartLite` (receives ctx from controller)
- async consumer/subscriber: `traceutil.ExtractHeaders` then `traceutil.StartLite`
- pass the same `ctx` downward — never create `context.Background()` inside a live request
- Kafka/MQTT outbound must inject trace headers via `traceutil.InjectHeaders`
- outbound HTTP gateways inject trace headers via `traceutil.InjectHeaders` on every request
- do **not** call `otel.Tracer(...).Start(...)` directly anywhere — always use `traceutil`

### Correlation

`traceId` is mandatory.

Add domain IDs when useful:
- `eventId`
- `tenantId`
- `orgId`
- `camId`
- `deviceId`
- `topic`
- `sourceType`
- `sourceFamily`

## Swagger Documentation Rules

Every controller handler **must** have a `swag` godoc block directly above the function, **except** for the cases listed under "Do not document" below.

Required fields:
- `@Summary` — short single-line label (≤ 10 words)
- `@Tags` — group name matching the router section (e.g. `Maps`, `Media`, `Devices`)
- `@Produce json`
- `@Success` — HTTP status code matching the actual `httputil.*` function used
- `@Failure 400 {object} gmod.ErrorResponse` — for validation errors
- `@Failure 401 {object} gmod.ErrorResponse` — for protected routes
- `@Failure 500 {object} gmod.ErrorResponse` — for server errors
- `@Router /path [method]`
- `@Security BearerAuth` — **only** on protected routes (registered under `AuthBearer()` middleware); omit for public routes

Optional fields:
- `@Description` — longer description when summary alone is not enough
- `@Accept json` / `@Accept multipart/form-data` — when body is expected
- `@Param` — one line per input param (path, query, body, formData)

### Do not document with swagger

Remove (or never add) the godoc swagger block for:

- **Webhook receivers** — e.g. Stripe, GitHub webhooks. These are called by external systems using their own signature/token scheme, not JWT. They must not appear in the API docs.
- **Internal ingest hot-paths** — raw event ingestion endpoints where authentication is handled at the network boundary (API key, TLS cert, etc.), not JWT.
- **Routes that are commented out in the router** — if the route is not actually registered, the swagger doc is dead code and must be removed.
- **Middleware-only functions and helpers** — these are not handlers.

### @Tags for public routes

Routes registered without `AuthBearer()` (under `/public/...` or equivalent) must use:

```
// @Tags         Public
```

Not the domain tag (e.g. `Subscription`, `SystemConfig`). This groups all public endpoints together in the Swagger UI.

### Shared handler on public + protected routes

When the same Go function is registered on both a public path and a protected path, **do not** use dual `@Router` lines in a single godoc block — swag cannot express different `@Security` requirements for two routes in one block.

Instead, create a thin protected wrapper with its own godoc:

```go
// ListFoosPublic godoc
// @Summary      List foos
// @Tags         Public
// @Produce      json
// @Success      200 {object} gmod.SuccessDataResponse
// @Failure      500 {object} gmod.ErrorResponse
// @Router       /public/foos [get]
func (ctrl *FooController) ListFoosPublic(c fiber.Ctx) error {
    return ctrl.listFoos(c)
}

// ListFoos godoc
// @Summary      List foos
// @Tags         Foos
// @Security     BearerAuth
// @Produce      json
// @Success      200 {object} gmod.SuccessDataResponse
// @Failure      401 {object} gmod.ErrorResponse
// @Failure      500 {object} gmod.ErrorResponse
// @Router       /foos [get]
func (ctrl *FooController) ListFoos(c fiber.Ctx) error {
    return ctrl.listFoos(c)
}

// listFoos is the shared implementation (unexported, no swagger).
func (ctrl *FooController) listFoos(c fiber.Ctx) error { ... }
```

Register each wrapper in the appropriate router group.

### `@Success` ↔ `httputil` mapping

| httputil call | Swagger annotation |
|---|---|
| `httputil.Ok(c, data)` | `@Success 200 {object} gmod.SuccessDataResponse` |
| `httputil.Ok(c, data, "msg")` | `@Success 200 {object} gmod.SuccessDataResponse` |
| `httputil.OkPaginated(c, details, pg)` | `@Success 200 {object} gmod.PaginationResponse` |
| `httputil.MessageOK(c, "msg")` | `@Success 200 {object} gmod.SuccessMessageResponse` |
| `httputil.Created(c, data, "msg")` | `@Success 201 {object} gmod.SuccessDataResponse` |
| `httputil.Accepted(c, data)` | `@Success 202 {object} gmod.SuccessDataResponse` |
| `httputil.NoContent(c)` | `@Success 204` |

### Example godoc block

```go
// CreateFoo godoc
// @Summary      Create a new foo
// @Description  Creates a foo resource and returns the created document.
// @Tags         Foos
// @Accept       json
// @Produce      json
// @Param        body  body  CreateFooRequest  true  "Foo input"
// @Success      201   {object}  gmod.SuccessDataResponse
// @Failure      400   {object}  gmod.ErrorResponse
// @Failure      401   {object}  gmod.ErrorResponse
// @Failure      500   {object}  gmod.ErrorResponse
// @Router       /foos [post]
// @Security     BearerAuth
func CreateFoo(c fiber.Ctx) error {
```

Rules:
- `@Success` status must match the actual `httputil.*` call — never write `@Success 200` when returning `httputil.Created`
- Protected routes (under `AuthBearer()`) **must** have `@Security BearerAuth` — missing it causes the endpoint to appear public in Swagger UI
- Public routes must **not** have `@Security BearerAuth`
- `@Tags` must match the router section name exactly (consistent casing); use `Public` for all no-auth routes
- Do not annotate middleware-only or helper functions
- Do not annotate webhook receivers, internal hot-path endpoints, or commented-out routes

## API / Response Rules

### Success envelopes

**Single / detail response** (`httputil.Ok`):
```json
{
  "code": "SUCCESS",
  "message": "...",
  "status": true,
  "details": {}
}
```

**Paginated list response** (`httputil.OkPaginated`):
```json
{
  "code": "SUCCESS",
  "message": "...",
  "status": true,
  "details": {
    "items": [],
    "summary": { "totalOnline": 10, "totalOffline": 1 }
  },
  "pagination": {
    "page": 1,
    "perPage": 10,
    "totalRecords": 11,
    "totalPages": 2,
    "sortField": "createAt",
    "sortOrder": "desc"
  }
}
```

Rules:
- use `details`, not `detail`
- keep envelope stable
- paginated lists: `pagination` is top-level — not nested inside `details`
- `summary` counts must cover the full org/filter scope, not just the current page
- use `perPage` (singular) via `gmod.PageMeta` — do not use `perPages`
- do **not** use `gmod.SendPagination` or `gmod.SendPaginationOK` — use `httputil.OkPaginated`


### ID field convention

Public-facing response models must use `json:"id"` for the primary identifier.

- **Never** use `json:"camId"`, `json:"deviceId"`, or other domain-specific names as the ID field in a response DTO
- The internal UUID is the value; the JSON key exposed to clients is always `"id"`

Example:
```go
type PublicCameraItem struct {
    CamID string `json:"id"` // ✅ exposed as "id", not "camId"
    ...
}
```

### Non-paginated collection response

Wrap collections in `fiber.Map{"items": items}` even without pagination:

```go
return httputil.Ok(c, fiber.Map{"items": items})
```

Result:
```json
{
  "code": "SUCCESS",
  "status": true,
  "details": { "items": [] }
}
```

**Never** return a bare array as `details`.

### Optional-auth route pattern

For endpoints that serve both anonymous and authenticated users:

**Router:**
```go
router.Get("/live/map", middleware.TryAuthBearer(), middleware.TryActiveOrg(), mapapi.PublicCameraMap)
```

**Controller:**
```go
orgId, _ := c.Locals("activeOrg").(string)
if orgId != "" {
    items, err := svc.GetOrgMap(ctx, orgId)
    ...
    return httputil.Ok(c, fiber.Map{"items": items})
}
items, err := svc.GetPublicMap(ctx)
...
return httputil.Ok(c, fiber.Map{"items": items})
```

- `TryAuthBearer()` — validates JWT if present, silently continues on failure (sets `userId`, `tenantId` locals)
- `TryActiveOrg()` — verifies Permify membership if auth locals are set, silently continues on failure (sets `activeOrg` local)
- Use `AuthBearer()` + `ActiveOrg()` (hard versions) for fully protected routes

### HTTP status contract

Default mapping:
- `200 OK` — GET, PATCH, PUT, DELETE success with body
- `201 Created` — POST create success
- `202 Accepted` — async job accepted
- `204 NoContent` — success with no response body
- `400 BadRequest` — validation / malformed input
- `401 Unauthorized` — missing or invalid auth
- `403 Forbidden` — authenticated but not allowed
- `404 NotFound` — resource not found
- `409 Conflict` — duplicate / state conflict
- `422 UnprocessableEntity` — syntactically valid but semantically invalid input, only if the API explicitly uses it
- `500 InternalServerError` — unexpected server error

Rule:
- do not return `200` for failures
- do not hide errors only in response body
- HTTP status and response body must agree

### Error contract

- service → sentinel/domain errors
- repo → wrapped storage errors
- gateways → wrapped integration errors
- messaging → wrapped transport errors
- controller → maps service errors to HTTP status + response code

Never leak raw internal/driver/SDK errors to API clients.

### Time rules

- use RFC3339 UTC across boundaries
- keep date/time field names consistent
- avoid multiple synonyms for the same public range fields unless intentionally documented

### Timestamp field naming convention

New code must use these canonical field names for creation/update timestamps:

| BSON field | JSON field | Go struct tag |
|---|---|---|
| `createdAt` | `createdAt` | `bson:"createdAt" json:"createdAt,omitempty"` |
| `updatedAt` | `updatedAt` | `bson:"updatedAt" json:"updatedAt,omitempty"` |

Legacy field names (`dateTimeCreate`, `dateTimeUpdate`, `createAt`, `updateAt`) may exist in older collections. When touching existing code:
- new fields/collections must use `createdAt` / `updatedAt`
- legacy fields should be migrated when the module is actively modified

## File / Package Rules

- every `.go` file must start with a path comment on line 1
- **file names use camelCase** — e.g. `publicMap.go`, `authStream.go`, `kmlUpload.go`; never `public_map.go` or `auth_stream.go`
- keep packages cohesive
- avoid dumping unrelated helpers into vague `utils` / `common`
- choose one transport package layout and keep it consistent
- no `logger.Dev` in merged code

Example:

```go
// controllers/mapapi/publicMap.go
package mapapi
```

## URL Path Rules

Every router path segment must be **camelCase**. Never use kebab-case (`-`) or snake_case (`_`) inside a path segment.

Applies to:
- static segments in `router/*.go` — `r.Post("/onboardingLink", ...)` ✅ not `/onboarding-link` ❌
- sub-resource/action segments — `/:id/renewMaintenance` ✅ not `/:id/renew-maintenance` ❌
- nested action paths — `/users/transferBillingOwnership` ✅ not `/users/transfer-billing-ownership` ❌
- Swagger `@Router` annotations must match the registered path exactly

| Context | Convention | Example |
|---|---|---|
| URL path segment | camelCase | `/checkoutSession`, `/resetStats` |
| Path param (`:name`) | camelCase | `/:userId`, `/:resourceId` |
| Query param | camelCase | `?sortField=createdAt&perPage=10` |
| File name | camelCase | `publicMap.go` |
| Go package | lowercase (no separator) | `mapapi`, `orgrepo` |
| MongoDB collection | snake_case | `media_stream_sessions` |
| Kafka topic | dot.separated.snake_case | `gw.events.normalized.v1` |

Rules:
- do **not** use kebab-case or snake_case in any URL segment — even if the action is multi-word
- sub-resource should use nested path with camelCase action — `/licenses/:id/renewMaintenance`, not `/licenses/:id/renew-maintenance` or `/renewLicenseMaintenance/:id`
- bulk action keywords (`/bulk`, `/bulk/approve`) stay lowercase single-word by convention — see Bulk CRUD Contract
- when renaming an existing endpoint, update the router, the controller swagger `@Router` line, and any frontend call site in the same change

Forbidden:
- `/onboarding-link` (kebab-case)
- `/onboarding_link` (snake_case)
- `/OnboardingLink` (PascalCase)
- `/onboardinglink` (all lowercase, loses word boundary)

## Startup Dependency Order

```text
logger.Init()
→ InitMongo()
→ InitRedis()
→ InitKafka()
→ InitOtel()
→ InitSecretboxKeyring()
→ app.NewContainer()
→ start consumers/subscribers
→ router.Init()
→ app.Listen()
```

Infra must be ready before container wiring and before serving/consuming starts.

## Bulk CRUD Contract

### Route structure

Resources follow a two-section pattern:

```text
CRUD collection/single:
  GET    /api/v1/{resource}          → List
  GET    /api/v1/{resource}/:id      → GetByID
  PATCH  /api/v1/{resource}/:id      → Update
  DELETE /api/v1/{resource}/:id      → Delete

Bulk CRUD:
  DELETE /api/v1/{resource}/bulk          → BulkDelete
  PATCH  /api/v1/{resource}/bulk          → BulkPatch
  POST   /api/v1/{resource}/bulk/approve  → BulkApprove (if resource needs it)
```

### Endpoint rules

- use HTTP method that matches the action (DELETE for delete, PATCH for patch) — never `POST /bulk-delete`
- use request body for target IDs — not query params
- `ids` is the canonical field name for the target list
- `:id` param should accept both domain UUID and alternative key (e.g. hwId) — service resolves

### Router pattern

```go
// Bulk CRUD (must be before /:id)
protected.All("/bulk", middleware.AllowMethods("DELETE", "PATCH"))
protected.Delete("/bulk", ctrl.BulkDelete)
protected.Patch("/bulk", ctrl.BulkPatch)

protected.All("/bulk/approve", middleware.AllowMethods("POST"))
protected.Post("/bulk/approve", ctrl.BulkApprove)

// CRUD single
protected.All("/:id", middleware.AllowMethods("GET", "PATCH", "DELETE"))
protected.Get("/:id", ctrl.GetByID)
protected.Patch("/:id", ctrl.Update)
protected.Delete("/:id", ctrl.Delete)
```

### Request shape

**Bulk Delete:**
```go
type bulkDeleteRequest struct {
    Ids []string `json:"ids"`
}
```

**Bulk Patch** — declare per-resource, use pointer fields:
```go
type deviceBulkPatchPayload struct {
    State         *string `json:"state,omitempty"`
    MapVisibility *string `json:"mapVisibility,omitempty"`
}

type bulkPatchDeviceRequest struct {
    Ids   []string               `json:"ids"`
    Patch deviceBulkPatchPayload `json:"patch"`
}
```

### Validation rules (controller)

- `ids` must not be empty
- batch size must not exceed 100
- de-duplicate ids before passing to service
- bulk patch: `patch` must include at least one allowed field
- never allow patch on: `id`, `tenantId`, `orgId`, `createdAt`, `createdBy`, `deletedAt`, secrets/credentials

### Service input

Controller must map to a service input struct — never pass fiber DTO directly:

```go
type BulkDeleteInput struct {
    TenantId string
    OrgId    string
    UserId   string
    Ids      []string
}
```

### Response shape

Use partial success as the default:

```go
type BulkItemFailure struct {
    Id     string `json:"id"`
    Reason string `json:"reason"`
}

type BulkActionResult struct {
    Requested     int               `json:"requested"`
    AppliedFields []string          `json:"appliedFields,omitempty"` // bulk patch only
    Succeeded     []string          `json:"succeeded"`
    Failed        []BulkItemFailure `json:"failed"`
}
```

Return via `httputil.Ok(c, result)` → `@Success 200 {object} gmod.SuccessDataResponse`

### Query params

Default: no query params.

Optional behavior flags if needed:
- `?dryRun=true` — validate + simulate, do not write
- `?strict=true` — all-or-nothing (if any item fails, the entire batch fails)

### Forbidden

- never use `map[string]any` as a patch payload
- never share patch field models across resources
- never allow bulk patch to modify relation/ownership — use a separate endpoint
- never hard delete by default for important resources (use soft delete / state transition)

## Review Checklist

Before merging, verify:
- flow matches canonical architecture
- no layer violations
- no `*fiber.Ctx` past controller
- `ctx` is first arg in inner-layer public methods
- service owns orchestration
- service does not call infra helpers directly
- repo owns camera lookup for `rtspUrl`
- messaging/gateway logic is not duplicated elsewhere
- logs use `logger.FromCtx`
- trace propagation is preserved across async boundaries
- controller uses `traceutil.StartLite` or `traceutil.Start` (not bare `otel.Tracer`)
- service uses `traceutil.StartLite` (child span) at top of every public function
- outbound HTTP gateway uses `traceutil.InjectHeaders` on every request
- Kafka/MQTT publish injects trace headers via `traceutil.InjectHeaders`
- Kafka/MQTT consumer: `traceutil.ExtractHeaders` then `traceutil.StartLite`
- responses use `utils/httputil` (not raw `c.Status().JSON()` or `gmod.Send*`)
- collections wrapped in `details: { items: [] }` — never bare `details: []`
- response model IDs use `json:"id"` — not `json:"camId"` or other domain names
- optional-auth routes use `TryAuthBearer()` + `TryActiveOrg()` (not hard auth versions)
- file names use camelCase
- URL path segments use camelCase — no kebab-case or snake_case in any router path; Swagger `@Router` matches the registered path exactly
- paginated lists use `httputil.OkPaginated` with `gmod.PageMeta` — pagination at top level, summary counts are org-wide
- router uses `r.All(AllowMethods(...))` + method handler pattern (not combined in one line)
- Swagger `@Success` status matches actual `httputil.*` call
- Swagger `@Security BearerAuth` present on **every** protected route (registered under `AuthBearer()`), absent on public routes
- Swagger `@Tags Public` used for all routes under `/public/...` or registered without `AuthBearer()`
- Swagger godoc removed from webhook receivers, internal hot-path endpoints, and commented-out routes
- When the same handler serves public + protected paths, two separate wrapper functions exist with separate godoc blocks (not dual `@Router` lines in one block)
- response envelope is stable
- time fields use RFC3339 UTC
- bulk operations use `DELETE/PATCH /bulk` pattern (not `POST /bulk-delete`)
- bulk request uses body `ids` field (not query params)
- bulk response returns partial success detail (`requested`, `succeeded`, `failed`)
- bulk patch uses explicit per-resource allowlist with pointer fields

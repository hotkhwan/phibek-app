<!-- .claude/rule/security.md -->
# Security Rules

## Auth Flow

```text
User → Frontend → Keycloak (Auth Code)
  → Gateway (Token Exchange) → JWT Verify → Permify
  → Protected API
```

## Required Headers

Protected routes require:

```text
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

## Auth Middleware

- `AuthBearer()` — validate JWT, set `userId` / `tenantId`
- `AuthBearerOrCookie()` — JWT or `KAPI_TOKEN` cookie
- `ActiveOrg()` — validate `X-Active-Org` via Permify gRPC
- `RequireRoles(...)` — role-based access from JWT claims

Middleware sets locals such as:
- `userId`
- `tenantId`
- `activeOrg`
- `traceId`

JWT validation belongs in middleware, not service.
Do not pass raw tokens into business logic.

## Authorization

- Permissions are **Owner / Editor / Viewer**
- Every protected resource operation must pass authorization
- `ActiveOrg()` validates org membership before handler execution
- `authzgw` owns Permify integration
- service layer owns authorization orchestration for resource actions

## Audit Logging

Applies to `POST`, `PUT`, `PATCH`, `DELETE`.

Rules:
- run `c.Next()` first, capture outcome after
- persist audit asynchronously
- never block response on audit persistence
- attach `traceId`
- redact sensitive fields before persisting

Sensitive keys must include at least:
- `password`
- `token`
- `secret`
- `authorization`

Dynamic policy may control response capture size/type.

## Crypto

All sensitive encryption/decryption must go through:

```text
internal/crypto/secretbox
```

Mandatory for:
- passwords
- API keys
- credentials
- secret tokens at rest

Rules:
- seal before insert/store
- open only when needed
- never store plaintext secrets in MongoDB
- never call raw crypto directly from controller/service/repo
- startup must fail fast if keyring/bootstrap cannot load

## Input Validation

- validate all input at the controller boundary
- never trust raw user input in MongoDB queries
- regex queries must use `regexp.QuoteMeta()`
- validate DTO fields before calling service

## Storage / S3

- enforce org ownership before generating presigned URLs
- presigned URL expiry must be bounded by config
- use shared storage helper paths consistently
- normalize object keys before signing/access

## JWT / Token Handling

- JWT is validated using Keycloak JWKS
- token exchange belongs to auth gateway code, not service/repo
- extract claims at middleware boundary
- never log raw access tokens
- never persist raw tokens unless explicitly required and encrypted

## CORS / Transport

- use HTTPS in deployed environments
- do not use wildcard CORS in production
- restrict debug endpoints to non-production
- do not expose internal-only endpoints publicly without explicit auth controls

## Dependency Injection Security

- initialize external clients once in bootstrap/container
- never create Mongo/Redis/Kafka/Permify/S3 clients inside request handlers
- secrets come from environment/secret manager only
- never hardcode credentials in code or tests

## Map Provider API Key Policy

### Forbidden

- Mount `MASTER_KEYRING_JSON` on frontend
- Let frontend decrypt `apiKeyEnc`
- Use the same Google API key for both frontend and backend
- Return plaintext server key in admin GET unless strictly necessary
- Expose `/system/configs/mapProvider` as public and hack middleware to skip auth per-method

### Required

- Separate **browser key** from **server key**
  - Browser key: exposed to FE via `/public/system/configs/mapProvider`, restricted via Google Cloud HTTP referrer + API restrictions
  - Server key: BE-only, IP-restricted, never sent to client
- Separate public endpoint (`/public/...`) from admin endpoint — no auth middleware hacks
- Encrypt both keys at rest with `secretbox`
- Enable usage monitoring / quota / rotation on Google Cloud side
- Consider App Check if public traffic is high or abuse is likely

### Google Cloud Key Restrictions (operational)

- Application restriction = **Websites**
- Allowed referrers: production domain, staging, localhost for dev
  - e.g. `https://aliza.k-lynx.com/*`, `http://localhost:3000/*`, `https://staging.example.com/*`
- API restriction: **Maps JavaScript API** only (and other browser-only APIs actually needed)
- Do not open key to entire project

## External Gateways

`internal/gateways/*` are outbound adapters only.

Rules:
- called from service layer only
- each gateway should own its types/errors
- use shared outbound client base where applicable
- propagate trace context on outbound calls when supported
- wrap third-party errors before returning

Typical gateways:
- `authgw`
- `authzgw`
- `webhookgw`
- `linegw`
- `telegw`
- `discordgw`

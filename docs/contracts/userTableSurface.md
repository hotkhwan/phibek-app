# User List Table Surface Contract

**Date:** 2026-04-27
**Status:** Superseded by [`user-profile-and-roles.md`](./user-profile-and-roles.md) on 2026-05-04 — FE display surface for the user list table at `/systemUsers/users` merged with the underlying user identity + role lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All 8-column display rule (no `phone`), Excel export shape mirroring the table, and the rev 1 product-decision rationale (phone exists in API row payload + KC attribute, just not rendered) preserved verbatim in §10 of the merged contract. "If phone needs to come back later, re-add the column definition only — no API change required" — preserved. Body kept here for PR / consumer history.
**Owner Backend:** `klynx-api`
**Tier:** Lite (FE display change only — no API surface change)
**Applies To Repos:** `klynx-feature`
**Contract Type:** FE
**Version:** v1

---

## 1. Purpose

Records what columns the user list table at `/systemUsers/users` renders, and the
matching Excel export shape, so future maintainers know the displayed surface is
intentional and not a regression. The underlying user data API at `/admin/users`
(klynx-api) is unaffected — the row payload still contains `phone`, it is simply
not rendered.

## 2. Displayed columns (table)

| Column | Source field |
|---|---|
| ลำดับ | derived row index |
| Avatar / fullname | `firstName + lastName` (Keycloak), `avatar` (user_profiles) |
| Username | `username` (Keycloak) |
| Email | `email` (Keycloak) |
| Status | `enabled` (Keycloak) |
| Role | `role` (Permify global realm role) |
| Created at | `createdAt` (Keycloak) |
| Action | inline edit / delete buttons |

## 3. Excel export columns

`exportToExcel` in `app/pages/systemUsers/users/index.vue` mirrors the table
columns above. The export sheet does **not** include `phone`.

## 4. Revision history

- **rev 1 (2026-04-27):** removed `phone` column from the user list table and
  matching Excel export (`เบอร์โทร`). Reason: product decision — phone was
  shown in the table but is not a routine identifier in this product, and was
  cluttering the row width on smaller screens. The `phone` field still exists
  in the user data model (Keycloak attribute) and the row payload returned by
  the API; FE simply does not render it. If phone needs to come back later,
  re-add the column definition only — no API change required.

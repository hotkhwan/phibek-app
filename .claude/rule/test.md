<!-- .claude/rule/test.md -->
# Testing & CI Rules

## Test Layout

```text
internal/
  services/ingestsvc/
    approve.go
    approve_test.go

tests/
  ingest_test.go

docs/test/
  <feature>-test-plan.md
  <feature>-manual.sh
  <feature>.postman_collection.json
```

- unit tests live beside the code (`*_test.go` next to source)
- Go integration tests live under `tests/`
- **all other test artifacts** — test plans, manual test scripts (curl/bash), ad-hoc verification scripts, Postman collections used for QA — live under `docs/test/`. Keep them out of the Go source tree so they are not built or deployed.

Naming convention under `docs/test/`:
- `<feature>-test-plan.md` — written test plan / checklist
- `<feature>-manual.sh` — runnable script for manual verification
- `<feature>.postman_collection.json` — Postman export

Do **not** put real credentials in any file under `docs/test/`. Use env-var references (`$KC_TOKEN`, `$ORG_ID`) and document how to populate them in the test plan.

## Unit Test Rules

- never connect to real MongoDB, Redis, Kafka, or Permify in unit tests
- define interfaces at the service boundary and use mocks/fakes
- test sentinel/domain errors explicitly
- prefer table-driven tests
- keep unit tests deterministic and isolated

## Controller Tests

Use a real Fiber app with `httptest`.

Test:
- request parsing
- validation failures
- HTTP status mapping
- response envelope shape
- service error → HTTP error mapping

Mock the service dependency passed into the controller.

## Integration Tests

Integration tests may use real infrastructure.

Test:
- full request → response cycle
- router + middleware wiring
- DB side effects
- auth behavior where applicable

Use separate test data/tenant/database.

## What Must Be Tested

- **service**: business logic, edge cases, sentinel/domain errors
- **controller**: HTTP behavior and response mapping
- **middleware**: auth rejection, locals set correctly
- **repo**: query behavior via integration tests

## What Not To Test

- internals of third-party libraries
- internals of `stomongo`
- simple boot/init functions unless behavior matters

## Test Quality Rules

- no flaky tests
- no sleeps where synchronization can be used
- no shared mutable state without control
- no `.only`
- no skipped tests without a comment explaining why
- race detector must pass

## Commands

```bash
go test ./...
go test -race ./...
go test ./tests/... -tags=integration
```

## CI Rules

CI must check at least:

- `gofmt -s -l .`
- `go vet ./...`
- `go mod tidy` with clean diff
- `go test -race ./...`

Recommended full test command:

```bash
go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
```

## Before Push Checklist

Run locally before pushing:

```bash
gofmt -s -w .
go vet ./...
go mod tidy
go test -race ./...
```

## Merge Gate

Do not merge when:
- formatting is dirty
- `go mod tidy` changes files
- tests fail
- race detector fails
- debug/test-only logging remains in production code

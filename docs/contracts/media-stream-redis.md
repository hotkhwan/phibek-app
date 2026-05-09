# Media Stream Redis Contract

**Date:** 2026-05-04
**Status:** Active (new — graphify-surfaced gap from `docs/plan/done/contract-grouping-audit.md` §"Graphify Findings 2026-05-04 — 2. Redis TTL / Stream Cache Contract Gap")
**Owner Backend:** `klynx-api`
**Related Plan:** N/A (this contract documents existing shipped behavior; no new BE work required)
**Applies To Repos:** `klynx-api`, ZLMediaKit (ZLM, external — webhook caller + kick target), `klynx-feature` (consumer of session-expiry behavior via player disconnect)
**Contract Type:** `Redis + REST`
**Version:** `v1` — documents shipped 4.x behavior

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `media-stream-redis` |
| Flow name | Klynx ↔ ZLM live stream session lifecycle: create → record session → guard via Redis TTL → expire → kick |
| Lifecycle scope | `POST /media/stream` (CreateStream) → ZLM `/onPlay` token validation → record `clientInfo` + `peerIP` keys with TTL → keyspace expiry → watcher reads `peerIP` and kicks ZLM session by IP |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| Redis | `klive:ttl:stream:<stream>` | trigger marker (small "1" value); expiry fires the watcher kick |
| Redis | `klive:clientinfo:stream:<stream>` | JSON `ClientInfo` (IP + UA + browser + OS + device + raw headers) per stream session |
| Redis | `klive:peerip:stream:<stream>` | peer IP string per stream; TTL strictly LONGER than `clientinfo` so watcher can read after expiry trigger |
| Redis | `media:device:<deviceId>` | JSON `MediaStreamCache` (ZLM proxy state mirror); 30-min static TTL |
| Redis | `media:lock:<streamKey>` | distributed lock for stream creation (SETNX) |
| Redis | `lock:klive:kick:stream:<stream>` | distributed lock for watcher kick (per-stream, 20s TTL) |
| Redis | `lock:klive:kick:peerip:<peerIP>` | distributed lock for watcher kick (per-IP, 1s TTL) |
| Redis pubsub | `__keyevent@<db>__:expired` | Redis keyspace notification channel — watcher subscribes to fire kicks on key expiry |
| REST | `POST /media/stream` (CreateStream) | writer of trigger marker + clientinfo + peerip + device cache + lock |
| REST | `POST /webhooks/streamzkt/onPlay` | refresh trigger marker + clientinfo + peerip on each play (ZLM-side calls in) |
| REST | `POST /webhooks/streamzkt/onPublish` | refresh clientinfo on publish (ZLM-side calls in) |
| REST | `POST /webhooks/streamzkt/onStreamNoneReader` | acquire stream lock + evict `media:device` cache when ZLM reports zero readers |
| REST | `POST /webhooks/streamzkt/onStreamNotFound` | evict `media:device` cache on ZLM not-found |
| Subprocess | `KillZLMByPeerIP` (outbound to ZLM) | watcher consumer — kicks ZLM session by `peer_ip` after Redis key expiry |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| Stream-endpoint resolver gate (`GET /media/stream/{camId}`) — Permify-based authorization | covered by `permission-profile.md` §5.5 (D9 admin bypass via `organization.manage`; D10 service-helper placement) | sibling contract |
| Camera identity / sync state (Klynx ↔ gateway-api projection) | covered by future `device-camera-domain.md` (Cluster #1 merged) | sibling contract |
| Play token validation (`mediasvc.ValidatePlayToken`) | upstream of this surface; play-token contract is separate (not yet documented as a contract) | (separate, pending) |
| Klive event Kafka topic (`klive.play.started`, `klive.play.denied`, `media.hook.on_play`, `media.hook.on_publish`) | sibling — Klynx Kafka consumer / producer surface (audit graphify gap) | future `klynx-kafka-consumer.md` |
| `gwdevicesync` in-process device-summary cache | internal optimization (RAM-only, per-pod; not Redis); no cross-service visibility | (internal — documented in code) |
| ZLM external API (`/index/api/getMediaInfo`, `/index/api/kick_sessions`, `/index/api/addStreamProxy`, `/index/api/delStreamProxy`) | upstream — ZLM owns its own API; klynx-api is the caller via `internal/gateways/mediagw` | (ZLM external) |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`permission-profile.md`](./permission-profile.md) | sibling — §5.5 stream-endpoint resolver gate is the authorization layer ABOVE this Redis surface; this contract handles session lifecycle AFTER auth passes |
| Future `klynx-kafka-consumer.md` | sibling — `klive.*` event topics are produced from this surface (`publishKliveEvent` calls in `streamzkt`); the Kafka consumer audit is a separate gap |
| Future `device-camera-domain.md` (Cluster #1) | sibling — camera identity flows through ingest into Mongo; this surface caches stream/session state in Redis |

### Grouping Rationale

This contract documents a **single coherent Redis surface** that all share one lifecycle (stream session create → guard → expire → kick) and one store (Redis with `notify-keyspace-events = Ex` configured). All 5 keys + 3 locks + 1 pubsub channel + 5 REST endpoints + 1 subprocess reference share:
- the same TTL config (`streamCfg` from `klivesvc/ttl.go`, env-driven with Mongo override)
- the same writer paths (`POST /media/stream` + ZLM webhooks)
- the same consumer (`StartStreamExpiryWatcher` in `klivesvc/watcherStream.go`)

A reader who wants to understand "why did my player suddenly disconnect after N minutes" needs all of: TTL config rules, key write order, peer-IP-vs-clientinfo TTL skew rule, watcher kick logic, and the keyspace notification config. Per `docs/contracts/README.md` grouping rule, these are one flow → one contract.

---

## 1. Purpose

Documents the Redis surface that backs the live stream session lifecycle — from `POST /media/stream` (CreateStream) through ZLM webhook callbacks (`OnPlay`, `OnPublish`, `OnStreamNoneReader`, `OnStreamNotFound`) to the keyspace-expiry-driven kick (`StartStreamExpiryWatcher`).

This was a **graphify-surfaced gap** — the behavior was shipped in 4.x but not previously documented as a cross-repo contract. Frontend / 3rd-party integrators that observe stream-session expiry behavior (player disconnect after configured TTL, "session kicked" dialogs, retry timing) need this contract to understand what's happening; ops engineers tuning the TTL config need this contract to understand the cache layout.

Key surface properties:

- **5 Redis key patterns** with explicit owners and TTL rules.
- **TTL skew rule** — `peerIP` key TTL is strictly **longer** than `clientinfo` key TTL so the watcher can read peer IP after the clientinfo expiry trigger fires.
- **`0 = nolimit`** — when configured TTL is 0, all caching is skipped (no kick, no expiry).
- **Required Redis config** — `notify-keyspace-events = Ex` is REQUIRED for the watcher to receive expiry events. Without it, sessions never expire and never get kicked.
- **3 distributed locks** — one for stream creation race-condition safety, two for the watcher kick path (per-stream + per-peer-IP).
- **External integration** — ZLM media server is both upstream (calls webhooks in) and downstream (watcher calls `kick_sessions` out). klynx-api is the broker.

`klynx-api` publishes this contract; FE consumes the session-expiry behavior indirectly (player disconnect); ops consumes the TTL config + Redis config requirement.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Stream session config | `klynx-api` | Mongo `options` collection (`_id: "system.stream"` new; `_id: "system.setting"` legacy fallback) | dual-read with new-source-wins; ENV overrides apply when DB is unset |
| Stream trigger marker (per-stream TTL) | `klynx-api` | Redis `klive:ttl:stream:<stream>` | small "1" value; expiry fires watcher kick |
| Stream client info (per-stream session) | `klynx-api` | Redis `klive:clientinfo:stream:<stream>` | JSON `ClientInfo`; refreshed on each `OnPlay` / `OnPublish` |
| Stream peer IP (per-stream session) | `klynx-api` | Redis `klive:peerip:stream:<stream>` | peer IP string; TTL strictly LONGER than clientinfo |
| ZLM device-stream cache | `klynx-api` | Redis `media:device:<deviceId>` | JSON `MediaStreamCache`; 30-min static TTL |
| Stream-creation lock | `klynx-api` | Redis `media:lock:<streamKey>` | SETNX; 10s TTL on CreateStream, 25s TTL on OnStreamNoneReader |
| Watcher kick locks | `klynx-api` | Redis `lock:klive:kick:stream:<stream>` (20s) + `lock:klive:kick:peerip:<peerIP>` (1s) | distributed locks for multi-replica deduplication |
| ZLM session state | ZLMediaKit | ZLM internal | klynx-api reads via `GetMediaInfo`; mutates via `kick_sessions` / `addStreamProxy` / `delStreamProxy` |
| In-process stream config cache | klynx-api `klivesvc/ttl.go` | RAM (per-pod, 30s TTL) | invalidated by `InvalidateStreamConfig()` after `PATCH /system/options` |

### Producer / Consumers

| Surface | Producer / Handler | Consumers | Notes |
|---|---|---|---|
| `klive:ttl:stream:<stream>` | `mediapi.CreateStream` ([controllers/mediapi/media.go:130](../../controllers/mediapi/media.go#L130)) | `StartStreamExpiryWatcher` ([internal/services/klivesvc/watcherStream.go](../../internal/services/klivesvc/watcherStream.go)) via Redis keyspace expiry | small marker; expiry triggers the watcher |
| `klive:clientinfo:stream:<stream>` | `mediapi.CreateStream` (initial); `streamzkt.OnPlay` (refresh on each play); `streamzkt.OnPublish` (refresh on publish) | `streamzkt.upsertClientInfoByStream` (read-modify-write); analytics / debug | watcher does NOT read this key (it expires before the watcher fires) |
| `klive:peerip:stream:<stream>` | `mediapi.CreateStream` (initial, TTL = clientinfo TTL + 60s); `streamzkt.OnPlay` (refresh, TTL = clientinfo TTL + 10s) | `StartStreamExpiryWatcher` (read after clientinfo expiry) | TTL skew rule — see §3 |
| `media:device:<deviceId>` | `mediapi.CreateStream` (set, 30-min TTL); `streamzkt.OnStreamNoneReader` (evict); `streamzkt.OnStreamNotFound` (evict); `mediapi.DeleteStream` (evict) | `mediapi.CreateStream` cache fast-path read; `streamzkt.OnStreamNoneReader` cleanup-skip read | optimistic ZLM proxy state mirror |
| `media:lock:<streamKey>` | `mediapi.CreateStream` (10s); `streamzkt.OnStreamNoneReader` (25s) | n/a — lock only | SETNX |
| `lock:klive:kick:stream:<stream>` | `StartStreamExpiryWatcher` (20s SETNX) | n/a — lock only | per-stream dedup |
| `lock:klive:kick:peerip:<peerIP>` | `StartStreamExpiryWatcher` (1s SETNX) | n/a — lock only | per-peer-IP dedup |
| `__keyevent@<db>__:expired` (Redis pubsub) | Redis (when key expires) | `StartStreamExpiryWatcher` Subscribe goroutine | filters by `klive:clientinfo:stream:` prefix |
| `KillZLMByPeerIP` outbound | `StartStreamExpiryWatcher` after expiry | ZLMediaKit `kick_sessions` API | external API |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Stream session (clientinfo + peerip) | Redis | watcher + analytics | not persisted to Mongo; lost on Redis flush |
| ZLM proxy mirror | Redis | `mediapi.CreateStream` cache fast-path | optimistic; misses re-fetch from ZLM via `GetMediaInfo` |

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Compatibility status:** documenting shipped 4.x behavior. No breaking change introduced by this contract.
- **Consumer requirements:**
  - `klynx-api` deployment: requires Redis with `notify-keyspace-events = Ex` configured (or any superset). Without `E` the watcher never receives expiry events; without `x` only key-expired events are missed. **Both flags are required.**
  - ZLM deployment: must have webhook callbacks pointing at `/api/v3/webhooks/streamzkt/{onPlay,onPublish,onStreamNoneReader,onStreamNotFound}` with `ZKT_SECRET` header for auth.
- **Deprecation window:** n/a.
- **Legacy compatibility note:** `clientinfo` key historically stored just the IP string (not JSON). The reader (`GetKliveClientInfoByStream`) detects this format and converts; on parse failure it deletes the malformed key. New writes always use JSON.

### Replay / Re-sync Behavior

- **Replay supported:** n/a — Redis state is ephemeral session state, not a projection of a persistent source. On Redis flush all keys vanish; new sessions populate fresh on next `CreateStream`.
- **Re-sync trigger:** none. If a `media:device:<deviceId>` cache entry is stale, the next `CreateStream` cache fast-path read will detect it via `GetMediaInfo` mismatch and evict; ZLM is the source of truth.
- **Duplicate delivery rule:**
  - Webhook calls (`OnPlay` / `OnPublish` / etc.) are idempotent — they upsert `clientinfo` + `peerip` keys with current TTL. Repeated calls extend the session.
  - Watcher kick is dedup'd via two locks (per-stream + per-peer-IP). Multiple replicas receiving the same expiry event will only one fire `KillZLMByPeerIP`.
- **Stream-config cache invalidation:** `InvalidateStreamConfig()` MUST be called after `PATCH /system/options` so the next `GetEffectiveCacheTTL` / `IsStreamSessionGuardEnabled` read picks up the new value. Otherwise the per-pod 30s cache window applies (eventual consistency).

### Write Authority Policy

- **`klynx-api` is the sole writer** of all Redis keys in this surface.
- ZLM never writes Redis directly — it calls klynx-api webhook handlers which then write Redis.
- Stream-session config (`streamCfg`) is read-only at this layer; mutated via `PATCH /system/options` (separate admin surface, not part of this contract).
- The stream-session **guard is server-enforced** — when `streamSessionGuardEnabled = false`, no Redis keys are written by `CreateStream`, no expiry is configured, and the watcher does not fire kicks. The guard effectively disables the entire surface.
- **`0 = nolimit` rule:** when `streamSessionDefaultSeconds = 0`, all cache writes in `CreateStream` are skipped (`nolimit := ttlSec == 0` short-circuits); webhook handlers also skip (`if guardEnabled && stream != "" && !nolimit`). Sessions never expire and never get kicked. `media:device:<deviceId>` is still set with 30-min TTL because it is a separate cache (ZLM proxy state, not session guard).
- **TTL skew rule (load-bearing):** `peerip` TTL MUST be strictly LONGER than `clientinfo` TTL. The watcher subscribes to `clientinfo` expiry; when that fires, the watcher needs to read the `peerip` key (which must still be alive). On `CreateStream`: `peerTTL = ttl + 60s`. On `OnPlay`: `peerip TTL = ttl + 10s` (smaller delta because `OnPlay` runs after the user is already actively viewing). Violating this rule degrades the watcher to "kick attempted but no peer_ip mapping" warning logs and **the kick silently fails**.

### Configuration Sources (resolution order, highest priority first)

| Field | Mongo (new) `system.stream` | Mongo (legacy) `system.setting` | ENV | Hard default |
|---|---|---|---|---|
| `guardEnabled` | `Value.StreamSessionGuardEnabled` (bool) | `streamSessionGuardEnabled` (bool) | `ZKT_STREAM_SESSION` (`true`/`1` → true) | `false` |
| `minSeconds` | `Value.StreamSessionMinSeconds` (≥ 1) | `streamSessionMinSeconds` (≥ 1) | `ZKT_STREAM_SESSION_MIN` (≥ 1) | `30` (`fallbackMinTimeout`) |
| `defaultSeconds` | `Value.StreamSessionDefaultSeconds` (≥ 0) | `streamSessionDefaultSeconds` (≥ 0; **0 = nolimit**) | `ZKT_STREAM_SESSION_DEFAULT` (≥ 1) | `600` (`fallbackDefaultTimeout`, 10 min) |
| `ttlOffset` | `Value.StreamSessionTtlOffsetSeconds` (any int) | `streamSessionTtlOffsetSeconds` (any int) | `ZKT_STREAM_SESSION_DIF` (any int) | `-15` (`fallbackDif`) |

> **Mongo new-source-wins:** if `_id: "system.stream"` exists, ALL legacy `system.setting` fields are ignored — no field-level merge across docs. Operators migrating from legacy must copy all four fields into the new doc or accept fallback to ENV/defaults for missing fields.
>
> **`minCacheTTLSec = 5` floor (not configurable):** the cache TTL formula is `cache = max(sessionTTL + ttlOffset, 5)`. With default `ttlOffset = -15` and `defaultSeconds = 600`, cache TTL = `600 + (-15) = 585s` ≈ 9m45s. Operators can set `ttlOffset` higher to shrink the gap between session TTL and cache TTL, but never below the 5-second floor.

---

## 4. Surface Summary

| Type | Name | Method / Topic / Key | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| Redis | `klive:ttl:stream:<stream>` | trigger marker | klynx-api only | `mediapi.CreateStream` | watcher (via keyspace expiry) |
| Redis | `klive:clientinfo:stream:<stream>` | JSON `ClientInfo` | klynx-api only | `CreateStream`, `OnPlay`, `OnPublish` | analytics/debug; watcher via key-expired event |
| Redis | `klive:peerip:stream:<stream>` | peer IP string (longer TTL than clientinfo) | klynx-api only | `CreateStream`, `OnPlay` | watcher (read after clientinfo expiry) |
| Redis | `media:device:<deviceId>` | JSON `MediaStreamCache` (30-min TTL) | klynx-api only | `CreateStream` (set), `OnStreamNoneReader`/`OnStreamNotFound`/`DeleteStream` (evict) | `CreateStream` fast-path; `OnStreamNoneReader` cleanup |
| Redis | `media:lock:<streamKey>` | SETNX 10s/25s | klynx-api only | `CreateStream` (10s), `OnStreamNoneReader` (25s) | n/a (lock only) |
| Redis | `lock:klive:kick:stream:<stream>` | SETNX 20s | klynx-api only | watcher | n/a (lock only) |
| Redis | `lock:klive:kick:peerip:<peerIP>` | SETNX 1s | klynx-api only | watcher | n/a (lock only) |
| Redis pubsub | `__keyevent@<db>__:expired` | sub channel | Redis-internal (requires `notify-keyspace-events = Ex`) | Redis | watcher Subscribe goroutine |
| REST | `POST /media/stream` (CreateStream) | application/json + Bearer | Bearer + active org + resolver gate (per `permission-profile.md` §5.5) | `controllers/mediapi/media.go::CreateStream` | klynx-feature live/videowall |
| REST | `POST /webhooks/streamzkt/onPlay` | ZLM webhook payload | `ZKT_SECRET` header | `controllers/webhooks/streamzkt/zktapi.go::OnPlay` | ZLM (calls in) |
| REST | `POST /webhooks/streamzkt/onPublish` | ZLM webhook payload | `ZKT_SECRET` header | `OnPublish` | ZLM (calls in) |
| REST | `POST /webhooks/streamzkt/onStreamNoneReader` | ZLM webhook payload | `ZKT_SECRET` header | `OnStreamNoneReader` | ZLM (calls in) |
| REST | `POST /webhooks/streamzkt/onStreamNotFound` | ZLM webhook payload | `ZKT_SECRET` header | `OnStreamNotFound` | ZLM (calls in) |

---

## 5. REST Surfaces

This section documents the REST endpoints that participate in the Redis surface. Full request/response schemas for the user-facing `POST /media/stream` are out of scope (covered by general `mediapi` documentation); this contract focuses on the **Redis side-effects** of each endpoint.

### 5.1 `POST /media/stream` (CreateStream) — Redis side effects

**Auth:** Bearer + `X-Active-Org` + resolver gate (per `permission-profile.md` §5.5).
**Purpose:** Create a ZLM stream proxy + record session state in Redis for the configured TTL window.

#### Order of Redis operations (when `guardEnabled && !nolimit`):

```text
1. ttlSec := klivesvc.GetEffectiveCacheTTL(ctx)         # cache TTL = sessionTTL + ttlOffset, floor 5s; 0 = nolimit
2. nolimit := (ttlSec == 0)                              # short-circuit when 0

3. ci := klivesvc.ExtractClientInfo(c)                   # browser IP + UA + headers from Fiber ctx

4. (only if !nolimit:)
   a. SetStreamTTLKey(ctx, req.Stream, ttl)              # klive:ttl:stream:<stream> (TTL = ttl)
   b. SetKliveClientInfoByStream(ctx, req.Stream, ci, ttl)
                                                          # klive:clientinfo:stream:<stream> (TTL = ttl)
   c. peerIP = ci.IP fallback → cf-connecting-ip → true-client-ip → x-real-ip → first(x-forwarded-for)
   d. SetKlivePeerIPByStream(ctx, req.Stream, peerIP, ttl + 60s)
                                                          # klive:peerip:stream:<stream> (TTL = ttl + 60s) ← STRICTLY LONGER

5. # ZLM proxy fast-path
   info, _, _ := mediagw.GetMediaInfo(...)
   if alive: SetDeviceStream(ctx, deviceID, &MediaStreamCache{...}, 30*time.Minute) and return
   else: DeleteDeviceStream(ctx, deviceID); AcquireStreamLock(ctx, req.Stream, 10s); ...

6. # Create proxy via ZLM addStreamProxy + wait-for-ready loop (12 attempts × 500ms)
7. SetDeviceStream(ctx, deviceID, &MediaStreamCache{...}, 30*time.Minute)
8. ReleaseStreamLock(ctx, req.Stream)
```

The trigger marker (`klive:ttl:stream:<stream>`) **resets TTL on every `CreateStream` call** — repeating the same stream extends the session.

#### Peer-IP fallback chain (locked)

If `ci.IP` (Fiber `c.IP()`) is empty, the writer falls back through the raw header map in this order:
1. `cf-connecting-ip`
2. `true-client-ip`
3. `x-real-ip`
4. first IP from `x-forwarded-for` (split on comma, trim)

If all fall back to empty, `SetKlivePeerIPByStream` writes empty string — but the implementation guards `if peerIP == ""` and does nothing (no-op). The watcher will then log "stream expired but no peer_ip mapping, skip kick" if the session reaches expiry.

### 5.2 `POST /webhooks/streamzkt/onPlay` — refresh on play

**Auth:** `ZKT_SECRET` header (out of band of Bearer auth).

#### Behavior

```text
1. Parse req: stream, clientIP (ZLM-side), token (URL query param)
2. ttlSec = GetEffectiveCacheTTL(ctx); nolimit = (ttlSec == 0)

3. If token != "":
   a. session = ValidatePlayToken(ctx, token, stream)  # external — play-token contract
   b. (only if guardEnabled && stream != "" && !nolimit:)
      - upsertClientInfoByStream(ctx, stream, clientIP, ttl)   # writes klive:clientinfo:stream:<stream>
      - if session.ClientIP != "":
          SetKlivePeerIPByStream(ctx, stream, session.ClientIP, ttl + 10s)   # ← STRICTLY LONGER
   c. publishKliveEvent("klive.play.started", ...)              # Kafka outbound (out of scope — sibling contract)
   d. return 0/success

4. Else (no token):
   a. allowStream(ctx, c, stream) checks public-camera-map OR ZKT_SECRET header
   b. (only if guardEnabled && stream != "" && !nolimit:)
      - upsertClientInfoByStream(ctx, stream, clientIP, ttl)
   c. publishKliveEvent("media.hook.on_play", ...)
   d. return 0/success
```

**Note the TTL skew on `OnPlay` is `+10s` (smaller) vs `CreateStream`'s `+60s` (larger).** The 10s buffer is sufficient because the user is actively viewing — clientinfo TTL reset is frequent.

### 5.3 `POST /webhooks/streamzkt/onPublish` — refresh on publish

**Auth:** `ZKT_SECRET` header.

#### Behavior

```text
1. allowStream(ctx, c, req.Stream) → if denied, return -1
2. ttlSec = GetEffectiveCacheTTL(ctx)
3. (only if ttlSec > 0:)
   ttl = ttl seconds
   upsertClientInfoByStream(ctx, stream, req.Ip, ttl)    # writes klive:clientinfo:stream:<stream>

4. publishKliveEvent("media.hook.on_publish", ...)
5. return 0/success
```

`OnPublish` writes only `clientinfo` — NOT `peerip` (publishers don't need the kick path; they own the stream).

### 5.4 `POST /webhooks/streamzkt/onStreamNoneReader` — ZLM no-readers cleanup

**Auth:** none documented (called by ZLM internal scheduler).

#### Behavior

```text
1. Parse req: vhost, app, stream
2. Spawn goroutine (delayed 20s):
   a. cached, ok = GetDeviceStream(bg, stream)
   b. If !ok: skip
   c. streamKey = vhost + "/" + app + "/" + stream
   d. AcquireStreamLock(bg, streamKey, 25s)               # 25s TTL — longer than CreateStream's 10s
   e. info, status = mediagw.GetMediaInfo(...)
   f. If err || status != 200: DeleteDeviceStream(bg, stream); return    # cache eviction
   g. If readerCount > 0: skip                              # someone else is viewing
   h. DelStreamProxy(bg, vhost, app, stream)
   i. DeleteDeviceStream(bg, stream)
   j. ReleaseStreamLock(bg, streamKey)
```

The 20s delay before checking is deliberate — gives a re-connector window.

### 5.5 `POST /webhooks/streamzkt/onStreamNotFound` — ZLM not-found eviction

**Auth:** `ZKT_SECRET` header.

#### Behavior

```text
1. Parse req: stream
2. DeleteDeviceStream(bg, stream)                         # evict media:device:<deviceId>
3. return 0/success
```

Simple eviction — no other state mutations.

---

## 6. Kafka / Async Event Surfaces

`N/A — not in scope of this contract.` `OnPlay`, `OnPublish`, `OnStreamNoneReader` etc. publish events to Kafka via `publishKliveEvent` (`klive.play.started`, `klive.play.denied`, `media.hook.on_play`, `media.hook.on_publish`). These topics belong to a sibling **Klynx Kafka consumer / producer surface** contract (graphify gap, separate audit task).

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` ZLM webhook callbacks are HTTP, not MQTT. Redis pubsub `__keyevent@<db>__:expired` is documented as a Redis surface (§4) — it is the watcher's input, not a cross-service realtime push.

---

## 8. Redis / Cache Surfaces

The full Redis surface is documented in this section. All keys live in the single Redis instance referenced by `config.Redis`; the database number is configurable via Redis URL.

### 8.1 `klive:ttl:stream:<stream>` — trigger marker

| Property | Value |
|---|---|
| Key pattern | `klive:ttl:stream:<stream>` |
| Value shape | string `"1"` |
| Owner / writer | `mediapi.CreateStream` only |
| Readers | none (the value is irrelevant); existence + expiry are the signal |
| TTL | `cacheTTL` = `max(sessionTTL + ttlOffset, 5)` from `GetEffectiveCacheTTL` |
| Refresh-on-read | n/a — never read |
| TTL alignment | aligned with `clientinfo` TTL (both use `ttl`); `peerip` TTL is +10s/+60s LONGER |
| Invalidation trigger | TTL expiry (Redis emits `__keyevent@<db>__:expired`) → watcher fires kick |
| Stale-read behavior | n/a — not read |
| Concurrency | last-writer-wins; SET overwrites with new TTL on each `CreateStream` |

### 8.2 `klive:clientinfo:stream:<stream>` — JSON `ClientInfo`

| Property | Value |
|---|---|
| Key pattern | `klive:clientinfo:stream:<stream>` |
| Value shape | JSON `ClientInfo` (see `models/klivemod` — `IP`, `UA`, `Lang`, `Browser`, `OS`, `Device`, `IPChain[]`, `RawHeaders{...}`) |
| Owner / writer | `mediapi.CreateStream` (initial); `streamzkt.OnPlay` (refresh on play); `streamzkt.OnPublish` (refresh on publish) |
| Readers | `streamzkt.upsertClientInfoByStream` (read-modify-write); analytics / debug |
| TTL | `cacheTTL` = `GetEffectiveCacheTTL(ctx)` (same as trigger marker) |
| Refresh-on-read | no — read does not extend TTL; only writes do |
| TTL alignment | sets the SHORTER TTL boundary; watcher fires when this key expires |
| Invalidation trigger | TTL expiry (key vanishes); ZLM cleanup (DEL via `OnStreamNotFound`) |
| Stale-read behavior | reader returns `(nil, false, nil)` after TTL expiry → caller treats as "no session" |
| Concurrency | last-writer-wins; `OnPlay`/`OnPublish` may overwrite mid-session |

**Legacy compatibility:** old format stored just IP string (not JSON). The reader (`GetKliveClientInfoByStream`) detects this and converts; on parse failure it deletes the malformed key. New writes always use JSON.

### 8.3 `klive:peerip:stream:<stream>` — peer IP

| Property | Value |
|---|---|
| Key pattern | `klive:peerip:stream:<stream>` |
| Value shape | peer IP string (e.g. `"203.0.113.42"`) — normalized via `net.SplitHostPort` to strip port + brackets |
| Owner / writer | `mediapi.CreateStream` (initial); `streamzkt.OnPlay` (refresh on play, only when token-validated session has `session.ClientIP`) |
| Readers | `StartStreamExpiryWatcher` (reads after clientinfo expiry to find the peer IP for the kick) |
| TTL | **STRICTLY LONGER than clientinfo TTL.** On `CreateStream`: `ttl + 60s`. On `OnPlay`: `ttl + 10s`. The skew is load-bearing — see §3 |
| Refresh-on-read | no |
| TTL alignment | longer than clientinfo TTL by design — clientinfo expires FIRST → watcher fires → reads peerip → kicks ZLM session |
| Invalidation trigger | TTL expiry; explicit `DeleteKlivePeerIPByStream(ctx, stream)` after watcher kick (cleanup) |
| Stale-read behavior | reader returns `("", false, nil)` after TTL expiry → watcher logs `"stream expired but no peer_ip mapping, skip kick"` and skips |
| Concurrency | last-writer-wins; OnPlay overwrites with the token-validated session's `ClientIP` if present |

### 8.4 `media:device:<deviceId>` — ZLM device-stream cache

| Property | Value |
|---|---|
| Key pattern | `media:device:<deviceId>` (deviceId == stream in current code) |
| Value shape | JSON `MediaStreamCache` (`DeviceId`, `StreamKey`, `URLHash`, `VHost`, `App`, `IsPublic`, `CreatedAt`, `LastReadyAt`, `LastSeenAt`) |
| Owner / writer | `mediapi.CreateStream` (set, 30-min TTL); evictions: `streamzkt.OnStreamNoneReader`, `streamzkt.OnStreamNotFound`, `mediapi.DeleteStream` |
| Readers | `mediapi.CreateStream` (cache fast-path — short-circuits ZLM `addStreamProxy` call); `streamzkt.OnStreamNoneReader` (cleanup-skip read) |
| TTL | **30 minutes (static)** — separate from session TTL config |
| Refresh-on-read | no |
| TTL alignment | independent of `streamCfg`; not affected by `0 = nolimit` |
| Invalidation trigger | (a) ZLM `GetMediaInfo` mismatch on cache fast-path → evict; (b) `OnStreamNoneReader` after `DelStreamProxy` → evict; (c) `OnStreamNotFound` → evict; (d) `DeleteStream` → evict |
| Stale-read behavior | reader returns `(nil, false, nil)` on TTL expiry; on JSON parse failure deletes the key and returns error. The cache fast-path verifies cached state via ZLM `GetMediaInfo` before reusing — never serves stale state to the user |
| Concurrency | last-writer-wins; `media:lock:<streamKey>` (§8.5) serializes concurrent `CreateStream` for the same stream |

### 8.5 `media:lock:<streamKey>` — stream-creation lock

| Property | Value |
|---|---|
| Key pattern | `media:lock:<streamKey>` (streamKey is `req.Stream` for CreateStream OR `vhost + "/" + app + "/" + stream` for OnStreamNoneReader) |
| Value shape | string `"1"` (irrelevant — only existence matters) |
| Owner / writer | `mediapi.CreateStream` (10s TTL); `streamzkt.OnStreamNoneReader` (25s TTL) |
| Readers | n/a — lock only |
| TTL | 10s (CreateStream) or 25s (OnStreamNoneReader); SETNX semantics |
| Refresh-on-read | no |
| TTL alignment | matches the worst-case duration of the protected critical section (ZLM addStreamProxy + wait-for-ready loop ≤ 6s on CreateStream; mediagw + delStreamProxy ≤ 25s on OnStreamNoneReader) |
| Invalidation trigger | explicit `ReleaseStreamLock(ctx, streamKey)` (DEL); fallback TTL expiry |
| Stale-read behavior | n/a |
| Concurrency | SETNX — first writer wins; second waits via not-acquired return path (caller does NOT spin-wait — proceeds without lock or skips) |

### 8.6 `lock:klive:kick:stream:<stream>` — watcher per-stream kick lock

| Property | Value |
|---|---|
| Key pattern | `lock:klive:kick:stream:<stream>` |
| Value shape | string `<podID>` (caller's pod identifier) |
| Owner / writer | `StartStreamExpiryWatcher` only |
| Readers | n/a — lock only |
| TTL | 20 seconds; SETNX |
| Refresh-on-read | no |
| Invalidation trigger | TTL expiry (no explicit DEL) |
| Stale-read behavior | n/a |
| Concurrency | dedup multiple replicas — first replica to receive the keyspace expiry event wins; others skip the kick attempt |

### 8.7 `lock:klive:kick:peerip:<peerIP>` — watcher per-peer-IP kick lock

| Property | Value |
|---|---|
| Key pattern | `lock:klive:kick:peerip:<peerIP>` |
| Value shape | string `<podID>` |
| Owner / writer | `StartStreamExpiryWatcher` only |
| Readers | n/a — lock only |
| TTL | **1 second** (very short); SETNX |
| Refresh-on-read | no |
| Invalidation trigger | TTL expiry |
| Stale-read behavior | n/a |
| Concurrency | dedup kicks against the SAME peer IP across multiple streams from the same browser (e.g. tab with 4 streams) — only one kick fires per second per peerIP. Subsequent streams from the same peerIP within the 1s window skip the kick |

### 8.8 `__keyevent@<db>__:expired` — Redis pubsub

| Property | Value |
|---|---|
| Channel pattern | `__keyevent@<db>__:expired` (where `<db>` = `config.Redis.Options().DB`) |
| Message shape | the expired key name (e.g. `klive:clientinfo:stream:<stream>`) |
| Subscriber | `StartStreamExpiryWatcher` Subscribe goroutine |
| Filter | only messages with prefix `klive:clientinfo:stream:` are processed; others ignored |
| Required Redis config | `notify-keyspace-events = Ex` (or any superset including `E` and `x`). Without it, no expired-event messages are published — sessions never get kicked |
| Reconnect behavior | on `ReceiveMessage` error: 150ms sleep then retry (skips on context cancel) |
| Backpressure | none — single consumer goroutine, sequential processing |

### 8.9 In-process stream config cache (`klivesvc/ttl.go`)

This is **NOT a Redis cache** — documented here for completeness because it gates the Redis surface.

| Property | Value |
|---|---|
| Storage | per-pod RAM (`var cachedCfg *streamCfg + cachedCfgAt time.Time + cacheCfgMu sync.Mutex`) |
| TTL | 30 seconds (`cacheDur = 30 * time.Second`) |
| Reader | every call to `IsStreamSessionGuardEnabled` / `GetMinStreamTimeout` / `GetEffectiveSessionTTL` / `GetEffectiveCacheTTL` |
| Writer | first read after TTL expiry triggers `loadStreamCfg(ctx)` → reads Mongo `system.stream` → `system.setting` → ENV → defaults |
| Invalidation | explicit `InvalidateStreamConfig()` (resets `cachedCfgAt = time.Time{}`); MUST be called after `PATCH /system/options` so the next read picks up new values immediately. Otherwise the per-pod 30s window applies |
| Cross-pod consistency | none — each pod has its own cache. Eventual consistency window = 30 seconds across the fleet |

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Cross-Surface Lifecycle

```
┌─────────────┐   POST /media/stream      ┌─────────────────────┐
│ klynx-feature│ ────────────────────────▶ │ mediapi.CreateStream│
└─────────────┘                            └─────────────────────┘
                                                      │
                                                      ▼
                            ┌──────────────────────────────────────────┐
                            │ Redis writes (when guardEnabled, !nolimit):│
                            │  1. SET klive:ttl:stream:<s>      EX ttl   │
                            │  2. SET klive:clientinfo:...      EX ttl   │
                            │  3. SET klive:peerip:...          EX ttl+60s│
                            │  4. SET media:device:<d>          EX 30m   │
                            │  5. SETNX media:lock:<sk>         EX 10s   │
                            └──────────────────────────────────────────┘
                                                      │
                                                      ▼
                            ┌──────────────────────────────────────────┐
                            │ ZLM addStreamProxy + GetMediaInfo loop    │
                            │ (12 attempts × 500ms wait-for-ready)      │
                            └──────────────────────────────────────────┘

┌─────────────┐   /onPlay (token)         ┌──────────────────┐
│  ZLM media  │ ─────────────────────────▶│ streamzkt.OnPlay  │
│  server     │                           └──────────────────┘
└─────────────┘                                    │
                                                   ▼
                        Redis refresh: clientinfo (ttl) + peerip (ttl + 10s)
                        Kafka publish: klive.play.started (out of scope)

┌─────────────────────────┐   key expired              ┌───────────────────┐
│ Redis keyspace listener │ ─────────────────────────▶ │ watcher (kicked)   │
│ (notify-keyspace-events) │ "klive:clientinfo:stream:" │                    │
└─────────────────────────┘                            │ 1. SETNX lock:stream│
                                                       │ 2. GET klive:peerip│
                                                       │ 3. SETNX lock:peerip│
                                                       │ 4. KillZLMByPeerIP │
                                                       │ 5. DEL klive:peerip│
                                                       └───────────────────┘
                                                                 │
                                                                 ▼
                                                  ZLM /index/api/kick_sessions
                                                  → player disconnects (FE-visible)
```

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `klive:ttl:stream:<s>` (trigger marker) | `mediapi.CreateStream` | user via `POST /media/stream` | Redis | TTL = cacheTTL |
| `klive:clientinfo:stream:<s>` (`ClientInfo` JSON) | `mediapi.CreateStream` (initial); `streamzkt.OnPlay`/`OnPublish` (refresh) | user via REST OR ZLM via webhook | Redis | last-writer-wins; refreshes session |
| `klive:peerip:stream:<s>` (peer IP) | `mediapi.CreateStream` (ttl+60s); `streamzkt.OnPlay` (ttl+10s) | user via REST OR ZLM via webhook | Redis | TTL strictly LONGER than clientinfo |
| `media:device:<d>` (`MediaStreamCache` JSON) | `mediapi.CreateStream` (set 30-min); evictions: `OnStreamNoneReader`/`OnStreamNotFound`/`DeleteStream` | user via REST OR ZLM via webhook | Redis | static 30-min TTL; ZLM mismatch triggers eviction |
| `media:lock:<streamKey>` | `mediapi.CreateStream` (10s); `streamzkt.OnStreamNoneReader` (25s) | user via REST OR ZLM via webhook | Redis | SETNX; explicit DEL on completion |
| `lock:klive:kick:stream:<s>` | watcher | Redis keyspace expiry event | Redis | 20s SETNX; per-stream dedup |
| `lock:klive:kick:peerip:<ip>` | watcher | Redis keyspace expiry event | Redis | 1s SETNX; per-peer-IP dedup |
| `streamCfg` (`guardEnabled`, `minSeconds`, `defaultSeconds`, `ttlOffset`) | platform admin via `PATCH /system/options` | platform admin | Mongo `options` collection (`_id: "system.stream"` or `_id: "system.setting"`) | written via separate admin surface; dual-read with new-source-wins |
| `cachedCfg` (in-process cache) | `loadStreamCfg(ctx)` | first read after 30s expiry | RAM (per-pod) | invalidated by `InvalidateStreamConfig()` after admin PATCH |
| ZLM session state | ZLM | ZLM internal scheduler + klynx kicks | ZLM internal | external system; klynx-api reads via `GetMediaInfo`, mutates via `kick_sessions` |

### 9.3 Conflict Resolution

- **Redis writes are last-writer-wins.** Refresh on `OnPlay` overwrites prior clientinfo. No CAS, no version field.
- **Stream-creation lock** (`media:lock:<streamKey>`) serializes concurrent CreateStream for the same stream — second caller does NOT spin-wait but proceeds without lock (best-effort serialization). Race window is bounded by ZLM `addStreamProxy` idempotency: ZLM returns `code=-1 "already exists"` for duplicate proxy creation, which klynx-api treats as success.
- **Watcher dedup locks**:
  - `lock:klive:kick:stream:<s>` (20s) — first replica to receive keyspace expiry event for a given stream wins. Other replicas observe `SETNX = false` and skip the kick.
  - `lock:klive:kick:peerip:<ip>` (1s) — within a 1-second window, multiple stream expiries from the SAME peer IP cause only one kick. This is intentional — kicking a peer IP terminates ALL its sessions at once (the kick API is ZLM-side wildcard by IP).
  - **Trade-off:** 1s window may suppress legitimate consecutive-kick scenarios where a user has multiple browsers behind the same NAT IP. Acceptable for v1; documented for future tuning.
- **TTL skew rule violation:** if operator misconfigures `peerip` TTL ≤ `clientinfo` TTL (e.g. via custom code), watcher will see expired `klive:clientinfo:stream:` events but `GetKlivePeerIPByStream` returns `(false, nil)` → watcher logs `"stream expired but no peer_ip mapping, skip kick"` and skips. The kick **silently fails**. This is enforced in code: `mediapi.CreateStream` writes `peerTTL = ttl + 60s` and `streamzkt.OnPlay` writes `ttl + 10s`. Do not deviate.
- **In-process cache staleness:** per-pod `streamCfg` lags Mongo by up to 30s. Operator MUST call `InvalidateStreamConfig()` after `PATCH /system/options` to force immediate refresh; otherwise eventual consistency applies.
- **Mongo dual-read:** if both `system.stream` (new) and `system.setting` (legacy) exist, **new wins entirely** (no field-level merge). Operators migrating from legacy must copy ALL four fields to the new doc; missing fields fall back to ENV/defaults, NOT the legacy doc.

---

## 10. Frontend Integration Notes

This contract is primarily a backend / ops contract. FE consumers see this surface indirectly:

### Required FE Inputs

| FE Use Case | Contract Surface | Required Behavior |
|---|---|---|
| Live player (HLS / FLV / WebRTC) | `POST /media/stream` (CreateStream) | trigger session — receives play URL on success |
| Player disconnect after configured TTL | (none — observable as ZLM session kick) | FE should detect player disconnect / stall and surface "session expired" UI; do NOT auto-reconnect aggressively (would re-trigger `CreateStream` on stale state) |
| Player reconnect / re-watch | `POST /media/stream` (refresh) | calling CreateStream for the same stream extends the session (TTL reset on every call) |

### FE Guardrails

- Do not assume any specific TTL value — read the configured value from `streamCfg` if needed (via `GET /system/options` admin surface, not exposed to non-admin users).
- Do not query Redis directly from FE. All session state is observable only through indirect signals (player connection state, `klive.play.*` Kafka events forwarded to klynx-feature via existing channels).
- If a player disconnects unexpectedly, do NOT auto-retry without user interaction — the disconnect may be a deliberate kick; auto-retry creates abuse loops that exhaust ZLM connection slots.
- Treat the stream-session-guard as opaque — do not encode TTL knowledge in FE timers.

---

## 11. Rollout Notes

| Repo | Dependency | Required | Notes |
|---|---|---|---|
| `klynx-api` | this contract | n/a (documents shipped behavior) | no new BE work |
| `klynx-api` | Redis must have `notify-keyspace-events` configured to include `Ex` | required for watcher to fire | check via `redis-cli CONFIG GET notify-keyspace-events`; expected output contains `Ex` |
| `klynx-api` | `cmd/commonmon` (camera monitor) — irrelevant to this surface | n/a | separate binary |
| ZLM deployment | webhook URLs configured to klynx-api `/api/v3/webhooks/streamzkt/*` | required for Redis writes on play/publish | depends on ZLM config files |
| ZLM deployment | `ZKT_SECRET` must match between klynx-api ENV and ZLM webhook header | required for `allowStream` auth | rotate together |
| `klynx-feature` | no contract change — player UX behavior is unaffected | — | indirect consumer only |

**Status:** all behavior already shipped in 4.x. This contract is documentation-only.

### Operator runbook items

- **To disable session guard entirely:** set `streamSessionGuardEnabled = false` (Mongo `system.stream` or env `ZKT_STREAM_SESSION=false`). Restart klynx-api OR call `InvalidateStreamConfig()` (no admin endpoint exposed today — restart is the supported method).
- **To set `nolimit`:** set `streamSessionDefaultSeconds = 0`. Cache writes skip on CreateStream/OnPlay/OnPublish; ZLM proxy cache (`media:device:<d>`) still writes with 30-min TTL.
- **To change effective session TTL:** update `streamSessionDefaultSeconds` (≥ `streamSessionMinSeconds`); the formula is `cache TTL = max(default + ttlOffset, 5)`. Default TTL offset is `-15` (cache TTL = 9m45s when default is 600s).
- **To verify watcher is working:** set a short TTL (e.g. `streamSessionDefaultSeconds = 60`), trigger a play, wait 60s; verify ZLM `kick_sessions` was called (server logs) AND player disconnected.
- **If kicks are not firing:** check (a) `notify-keyspace-events` Redis config; (b) `streamSessionGuardEnabled = true`; (c) `peerip` key was written (`redis-cli GET klive:peerip:stream:<stream>`); (d) watcher logs (`pod=` line on startup) for "✅ stream expiry watcher started".

---

## 12. Examples

### 12.1 Happy path — guard enabled, default config

`streamSessionGuardEnabled=true`, `defaultSeconds=600`, `ttlOffset=-15`, `minSeconds=30`. Cache TTL = `max(600 + (-15), 5) = 585s`.

```text
T=0s    User → POST /media/stream {stream: "abc"}
        Redis writes:
          klive:ttl:stream:abc            → "1"        EX 585
          klive:clientinfo:stream:abc     → {ip: "1.2.3.4", ua: "...", ...}  EX 585
          klive:peerip:stream:abc         → "1.2.3.4"  EX 645  (= 585 + 60)
          media:device:abc                → {...}      EX 1800 (30min)
        ZLM addStreamProxy → ready

T=10s   ZLM → POST /webhooks/streamzkt/onPlay (token validated)
        Redis writes:
          klive:clientinfo:stream:abc     → {...refreshed...}  EX 585
          klive:peerip:stream:abc         → "1.2.3.4"  EX 595  (= 585 + 10)

T=595s  klive:clientinfo:stream:abc EXPIRES → keyspace event
        watcher:
          1. SETNX lock:klive:kick:stream:abc EX 20 → ok
          2. GET klive:peerip:stream:abc → "1.2.3.4" (still alive, 50s remaining)
          3. SETNX lock:klive:kick:peerip:1.2.3.4 EX 1 → ok
          4. KillZLMByPeerIP("1.2.3.4") → ZLM kicks all sessions from 1.2.3.4
          5. DEL klive:peerip:stream:abc
        FE player → disconnect (observable to user)
```

### 12.2 nolimit (defaultSeconds = 0)

`streamSessionGuardEnabled=true`, `defaultSeconds=0`. `GetEffectiveCacheTTL` returns 0 → `nolimit = true`.

```text
T=0s    User → POST /media/stream {stream: "abc"}
        Redis writes (cache writes ALL SKIPPED):
          (no klive:ttl:stream:*)
          (no klive:clientinfo:stream:*)
          (no klive:peerip:stream:*)
          media:device:abc → {...}  EX 1800   (still written — ZLM proxy mirror is separate)
        ZLM addStreamProxy → ready

T=∞     Session never expires; watcher never fires kick. User must close player manually.
```

### 12.3 guardDisabled

`streamSessionGuardEnabled=false`. `IsStreamSessionGuardEnabled` returns false; webhook handlers also short-circuit.

```text
T=0s    User → POST /media/stream {stream: "abc"}
        Redis writes (cache writes SKIPPED — same as nolimit):
          (no klive:ttl:stream:*)
          (no klive:clientinfo:stream:*)
          (no klive:peerip:stream:*)
          media:device:abc → {...}  EX 1800
        ZLM addStreamProxy → ready

ZLM /onPlay: clientinfo write skipped (`if guardEnabled && stream != "" && !nolimit`)
Watcher: not started (`if !IsStreamSessionGuardEnabled() { ... watcher disabled }`)
```

### 12.4 ZLM no-readers cleanup

```text
T=0s    Stream "abc" was active; user closed all viewers; ZLM detects readerCount=0
        ZLM → POST /webhooks/streamzkt/onStreamNoneReader
        klynx-api spawns goroutine, sleeps 20s

T=20s   goroutine:
          1. GetDeviceStream(stream="abc") → cached
          2. AcquireStreamLock("__defaultVhost__/live/abc", 25s) → ok
          3. mediagw.GetMediaInfo(...) → status=200, code=0 (proxy alive in ZLM)
             readerCount=0 (still no readers after 20s grace window)
          4. mediagw.DelStreamProxy(...) → ok
          5. DeleteDeviceStream("abc") → evicted
          6. ReleaseStreamLock(...) → ok
        ZLM proxy gone; cache evicted; new CreateStream will re-create.
```

### 12.5 Concurrent CreateStream on same stream

```text
T=0s    Replica A: POST /media/stream {stream: "abc"}
        Replica B: POST /media/stream {stream: "abc"}  (concurrent)

A:      AcquireStreamLock("abc", 10s) → ok (won race)
B:      AcquireStreamLock("abc", 10s) → false (lost)
        B proceeds without lock — best-effort

A:      ZLM addStreamProxy → code=0 (created)
B:      ZLM addStreamProxy → code=-1 ("already exists") → treated as success
        Both return 200/success to caller. Race resolved by ZLM idempotency.
```

### 12.6 Watcher dedup (multi-replica)

```text
3 klynx-api replicas all subscribed to __keyevent@0__:expired

T=595s  klive:clientinfo:stream:abc EXPIRES
        Redis publishes "klive:clientinfo:stream:abc" to all 3 subscribers

Replica 1: SETNX lock:klive:kick:stream:abc → ok       → fires kick
Replica 2: SETNX lock:klive:kick:stream:abc → false    → skip
Replica 3: SETNX lock:klive:kick:stream:abc → false    → skip

Only one kick fires. Other replicas log "lock not acquired" implicitly via the continue branch.
```

### 12.7 Watcher peer-IP dedup (multi-stream same browser)

User has 4 streams playing in 4 tabs from same NAT IP `203.0.113.42`. All 4 expire within 1 second.

```text
T=595s  4 keyspace expiry events arrive at watcher

Stream a: SETNX lock:klive:kick:stream:a → ok; GET peerip → "203.0.113.42"
          SETNX lock:klive:kick:peerip:203.0.113.42 EX 1 → ok → KillZLMByPeerIP("203.0.113.42") → kicks all 4 sessions

Streams b/c/d (within 1s): SETNX lock:klive:kick:peerip:203.0.113.42 → false → skip kick
                          (all 4 sessions already kicked by Stream a's call)
```

### 12.8 Missing peerip mapping

```text
CreateStream is called with empty Fiber c.IP() AND no fallback header succeeds
(degenerate case — should not happen in production behind any normal proxy).

Redis writes:
  klive:ttl:stream:abc          → "1"  EX 585
  klive:clientinfo:stream:abc   → {ip:"", ...}  EX 585
  (klive:peerip:stream:abc — SKIPPED because peerIP is empty; no-op in SetKlivePeerIPByStream)

T=585s  watcher fires:
        GetKlivePeerIPByStream("abc") → ("", false, nil)
        log: "stream expired but no peer_ip mapping, skip kick"
        (kick silently fails; ZLM session continues until ZLM-side timeout)
```

### 12.9 Redis missing notify-keyspace-events config

```text
Redis CONFIG GET notify-keyspace-events → "" (empty)

Watcher startup:
  Subscribe(__keyevent@0__:expired) → succeeds
  (but Redis never publishes any messages — the config is required for events to fire)

CreateStream writes keys with TTL → keys silently expire → NO message published → watcher never fires kick.
Sessions live until ZLM-side timeout (which is uncoordinated with klynx config).

Fix: redis-cli CONFIG SET notify-keyspace-events Ex
     OR persist via redis.conf.
```

### 12.10 Operator changes session TTL

```text
T=0s    Operator: PATCH /system/options { streamSessionDefaultSeconds: 1800 } (30 min)
        Mongo write succeeds; in-process cache still has old value (600s).

T=0s    Operator: (separate admin endpoint) → InvalidateStreamConfig()  [or restart pod]
        Cache cleared.

T=1s    Next CreateStream → loadStreamCfg → reads new value 1800 → cacheTTL = max(1800-15, 5) = 1785s
```

If operator forgets to invalidate: per-pod cache lives 30s → eventual consistency window.

---

## 13. Out of Scope (Not in This Contract)

- Stream-endpoint resolver gate (`GET /media/stream/{camId}` Permify check) — covered by `permission-profile.md` §5.5.
- Play-token contract (`mediasvc.ValidatePlayToken`) — not yet documented as a contract.
- Klive event Kafka topics (`klive.play.started`, `klive.play.denied`, `media.hook.on_play`, `media.hook.on_publish`) — sibling Klynx Kafka consumer / producer surface (graphify gap).
- ZLM external API (`/index/api/getMediaInfo`, `/index/api/kick_sessions`, `/index/api/addStreamProxy`, `/index/api/delStreamProxy`) — owned by ZLM; klynx-api is the caller via `internal/gateways/mediagw`.
- `gwdevicesync` in-process device-summary cache — internal optimization (RAM-only, per-pod; not Redis); no cross-service visibility. Documented in code only.
- Camera CRUD + sync state — covered by future `device-camera-domain.md` (Cluster #1 merged).
- Snapshot / recording playback / stream archive endpoints — separate surfaces, separate contracts.

---

## 14. Decisions

- **TTL skew rule (load-bearing):** `peerip` TTL strictly LONGER than `clientinfo` TTL. CreateStream uses `+60s`; OnPlay uses `+10s`. The smaller delta on OnPlay is intentional — user is actively viewing so refresh is frequent. Violating this rule causes silent kick failure.
- **`0 = nolimit`:** when `defaultSeconds = 0`, all session-guard cache writes are skipped; ZLM proxy cache (`media:device:*`) still writes. Sessions never expire and never get kicked. This is the intended bypass for perpetual streams.
- **`minCacheTTLSec = 5` floor (not configurable):** prevents pathologically short TTLs from breaking the kick path. Operators can set `ttlOffset` to tune the gap but never below 5s.
- **Mongo new-source-wins:** `system.stream` doc fully replaces `system.setting`; no field-level merge. Operators MUST copy all four fields when migrating.
- **In-process 30s config cache:** per-pod RAM cache trades cross-pod consistency for read-path latency. `InvalidateStreamConfig()` called by admin PATCH handler.
- **1-second peer-IP kick lock:** intentionally short — kicks are cheap to repeat per peer-IP if multiple streams expire within the same second, but we still dedup the ZLM API call. Trade-off vs legitimate consecutive-kick scenarios documented in §9.3.
- **Watcher uses pod ID as lock value:** allows debugging which replica fired a given kick (lock value carries `podID`). No release-on-completion — TTL expiry is the cleanup.
- **ZLM idempotency for proxy creation:** `addStreamProxy` returning `code=-1 "already exists"` is treated as success. This is the resolution for the concurrent-CreateStream race (best-effort lock with ZLM as the tiebreaker).

---

## 15. Implementation evidence

| Surface | File | Note |
|---|---|---|
| `streamCfg` config loader + cache | [internal/services/klivesvc/ttl.go](../../internal/services/klivesvc/ttl.go) | dual-read Mongo, ENV fallback, 30s in-process cache, `InvalidateStreamConfig()` |
| `IsStreamSessionGuardEnabled`, `GetEffectiveCacheTTL`, etc. | [internal/services/klivesvc/ttl.go](../../internal/services/klivesvc/ttl.go) | public read API |
| `klive:ttl:stream:*` writer/reader/deleter | [internal/repo/cachego/cacheklive/streamttl.go](../../internal/repo/cachego/cacheklive/streamttl.go) | `SetStreamTTLKey`, `GetStreamTTLKey`, `DeleteStreamTTLKey` |
| `klive:clientinfo:stream:*` writer/reader | [internal/repo/cachego/cacheklive/klive.go](../../internal/repo/cachego/cacheklive/klive.go) | JSON `ClientInfo` shape; legacy IP-only format compat |
| `klive:peerip:stream:*` writer/reader | [internal/repo/cachego/cacheklive/peerip.go](../../internal/repo/cachego/cacheklive/peerip.go) | peer IP normalization via `net.SplitHostPort` |
| `media:device:*` writer/reader/deleter | [internal/repo/cachego/cacheklive/media.go](../../internal/repo/cachego/cacheklive/media.go) | `SetDeviceStream`, `GetDeviceStream`, `DeleteDeviceStream`, `HashURL` |
| `media:lock:*` SETNX | [internal/repo/cachego/cacheklive/media.go](../../internal/repo/cachego/cacheklive/media.go) | `AcquireStreamLock`, `ReleaseStreamLock` |
| Watcher | [internal/services/klivesvc/watcherStream.go](../../internal/services/klivesvc/watcherStream.go) | `StartStreamExpiryWatcher` — keyspace subscribe + per-stream lock + per-peer-IP lock + `KillZLMByPeerIP` |
| `KillZLMByPeerIP` outbound | [internal/services/klivesvc/killPeerip.go](../../internal/services/klivesvc/killPeerip.go) | mediagw call to ZLM `kick_sessions` |
| `mediapi.CreateStream` (writer for trigger + clientinfo + peerip + device cache + lock) | [controllers/mediapi/media.go](../../controllers/mediapi/media.go) | full Redis write order; peer-IP fallback chain |
| ZLM webhooks | [controllers/webhooks/streamzkt/zktapi.go](../../controllers/webhooks/streamzkt/zktapi.go) | `OnPlay`, `OnPublish`, `OnStreamNoneReader`, `OnStreamNotFound`; `upsertClientInfoByStream` helper |
| `ExtractClientInfo` | [internal/services/klivesvc/clientinfo.go](../../internal/services/klivesvc/clientinfo.go) | UA/headers parsing for `ClientInfo`, `IPChain` |

---

## 16. Checklist

- [x] Domain / flow boundary explicit (§0 — 5 Redis keys + 3 locks + 1 pubsub + 5 REST endpoints + 1 outbound subprocess; explicit excludes for permission-profile gate, play-token, Kafka, gwdevicesync internal cache, ZLM external API, camera CRUD).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (Mongo `options` for config; Redis for runtime state; ZLM for session truth).
- [x] Producers and consumers listed for every surface in scope.
- [x] All Redis key patterns documented (key shape, value shape, owner, readers, TTL, refresh-on-read, alignment, invalidation triggers, stale-read behavior, concurrency).
- [x] TTL skew rule preserved (peerip > clientinfo by +60s on CreateStream / +10s on OnPlay).
- [x] Configuration sources resolution order preserved (Mongo new → Mongo legacy → ENV → hard default; new-source-wins).
- [x] `0 = nolimit` rule preserved.
- [x] `minCacheTTLSec = 5` floor preserved.
- [x] Required Redis config preserved (`notify-keyspace-events = Ex`).
- [x] In-process 30s config cache + invalidation rule preserved.
- [x] Watcher dedup locks preserved (per-stream 20s + per-peer-IP 1s).
- [x] Stream-creation lock preserved (10s on CreateStream, 25s on OnStreamNoneReader; SETNX best-effort).
- [x] Peer-IP fallback chain preserved (cf-connecting-ip → true-client-ip → x-real-ip → first(x-forwarded-for)).
- [x] Legacy compat preserved (clientinfo IP-only format detection + auto-migration).
- [x] Kafka N/A — explained (sibling contract).
- [x] MQTT N/A — explained.
- [x] Field ownership table preserved.
- [x] Conflict resolution rules preserved (last-writer-wins; SETNX for races; 1-second peer-IP window trade-off).
- [x] Backward compatibility — n/a (new contract documenting shipped behavior).
- [x] Replay / re-sync — explained (ephemeral state; ZLM is source of truth; cache fast-path verifies via GetMediaInfo).
- [x] FE integration notes preserved.
- [x] Operator runbook items preserved.
- [x] Examples cover happy path, nolimit, guardDisabled, ZLM no-readers cleanup, concurrent race, watcher dedup, peer-IP dedup, missing peerip, missing keyspace config, operator TTL change.
- [x] Decisions preserved (TTL skew, nolimit, floor, new-source-wins, in-process cache, peer-IP window, pod ID lock value, ZLM idempotency).
- [x] Implementation evidence table preserved.

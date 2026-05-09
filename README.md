# PHIBEK · winn

SvelteKit 2 / Svelte 5 frontend for the PHIBEK platform. Brand-rebranded
fork of the klynx Nuxt FE, structured on the gateway-portal SvelteKit
skeleton with the Cyber Admin v2.0 theme.

| | |
|---|---|
| **Stack** | SvelteKit 2.50 · Svelte 5 · Vite 7 · adapter-node · Bun · paraglide-js |
| **Theme** | Cyber Admin v2.0 (Bootstrap 5.3) + PHIBEK CI overrides |
| **Auth** | Keycloak silent SSO + httpOnly cookie session |
| **Realtime** | MQTT (singleton) · WebRTC (ZLM) · FLV · HLS |
| **Backend** | klynx-api (`/api/v1` + `/sso` + MQTT broker) |

## Quick start

```sh
# Install
bun install

# Wire env (klynx-api production by default — see .env / .env.example)
cp .env.example .env

# Dev (port from .env: PUBLIC_APP_BASE_PORT, default 3001)
bun run dev

# Type check (also runs i18n:compile + svelte-kit sync)
bun run check

# Production build (adapter-node → ./build/)
bun run build

# Run the built server
bun run start
```

## Project layout

```
src/
├── app.html, app.d.ts, hooks.server.ts
├── lib/
│   ├── api/           REST clients (auto Bearer + X-Active-Org)
│   ├── client/        Browser-only modules (keycloak.ts)
│   ├── components/
│   │   ├── app/       AppHeader / Sidebar / TopNav / Footer / ThemePanel
│   │   ├── shared/    Domain starters · Toaster · media players
│   │   ├── bootstrap/ Card primitives
│   │   ├── plugins/   Apex / ChartJs / PerfectScrollbar / Highlight
│   │   └── leaflet/   Map widgets
│   ├── i18n/          paraglide-generated (do not edit)
│   ├── i18nClient/    setLanguage helpers
│   ├── server/        auth/jwt/permission helpers
│   ├── stores/        auth · branding · notify · mqtt · activeWorkspace · …
│   ├── styles/        app.css
│   ├── types/         shared TS types
│   └── utils/         fetch · streamUrl · sse · asset · title · logger
├── routes/
│   ├── (app)/         protected routes (dashboard / aiSearch / iotWatch /
│   │                  iotControl / systemDevices / systemUsers / edge-ai /
│   │                  ingest / floorPlans / police / polices / admin /
│   │                  live / map / videowall / biDash / mqtt / watchman /
│   │                  subscription / pricing / profile / settings)
│   ├── (base)/        auth + API endpoints
│   └── (public)/      landing · changelog · docs · error · comingsoon
├── scss/              Cyber Admin v2.0 + PHIBEK CI overrides
└── jsvectormap.d.ts
```

## Deploy

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage `oven/bun:1.2-debian` → `node build/index.js` on port 3001 |
| `.dockerignore` | Excludes node_modules / .svelte-kit / build / docs / theme reference |
| `Jenkinsfile` | Build → push to harbor (`regis.pointit.co.th/phibek/phibek-app`) → bump `k8s/deployment.yaml` image tag |
| `k8s/deployment.yaml` | Deployment + ClusterIP Service in `gw` namespace |
| `k8s/referencegrant.yaml` | Allow istio-system HTTPRoute to reference the service |
| `.env.prod` | Production env values (mirror to k8s ConfigMap or pass as `--build-arg`) |

## CI / branding

| Token | CSS var | Hex |
|---|---|---|
| Phibek Navy | `--phibek-navy` | `#0F1C3F` |
| Oracle Gold (`$primary`) | `--phibek-oracle-gold` | `#C9952A` |
| Foresight Gold (`$theme`) | `--phibek-foresight-gold` | `#E8B84B` |
| Wisdom Cream (`$body-color`) | `--phibek-wisdom-cream` | `#F5F3EE` |

Drop the official logo files into `static/img/logo/` (see
[static/img/logo/README.md](static/img/logo/README.md) for the file list).

## Domain naming

klynx domains are FE-rebranded for the PHIBEK platform; backend API/Kafka
topic names stay original.

| klynx | phibek-app |
|---|---|
| `ksearch` | `aiSearch` |
| `kwatch` | `iotWatch` |
| `kcontrol` | `iotControl` |

## Phase history

See [CHANGELOG.md](CHANGELOG.md) for per-version detail. The full bootstrap
plan (now archived) is in [docs/plan/done/svelte-kit-bootstrap-from-klynx.md](docs/plan/done/svelte-kit-bootstrap-from-klynx.md).

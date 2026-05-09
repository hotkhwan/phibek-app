# SvelteKit Bootstrap (klynx → /home/phibek/app, theme: cyber_admin_v2.0)

**Date:** 2026-05-06
**Status:** ✅ Done 2026-05-06 — all 7 phases shipped (47 routes, 1615 i18n keys, 5 lib/api modules per domain, 4 media players, MQTT singleton, Keycloak SSO, PHIBEK CI). `bun run check` 0/0, `bun run lint` 0/0, `bun run build` produces adapter-node bundle + Dockerfile/k8s/Jenkinsfile committed.
**Review Status:** Self-reviewed (single-session FE bootstrap)
**Feature Owner Backend:** N/A (FE-only repo bootstrap)
**Related Repos:** source `klynx` (Nuxt 4) → target `/home/phibek/app` (SvelteKit 2). Theme reference: `cyber_admin_v2.0/template_html`. Skeleton reference: `gateway-portal`.
**Related Contract:** ไม่ต้องมี cross-repo contract (consumes คงเดิมของ `klynx-api`); FE follow-up exception per `AGENTS.md` §"Frontend Follow-Up Exception".

---

## 1. Executive Summary

แยก FE ใหม่จาก [klynx](/home/klynx/klynx) (Nuxt 4 + Vue 3) มาเป็น SvelteKit 2 / Svelte 5 app ที่ [/home/phibek/app](/home/phibek/app) โดย:
- ใช้ **โครง project (config + structure)** จาก [gateway-portal](/home/phibek/gateway-portal) ให้ตรงกัน (route groups, paraglide-js i18n, hooks.server.ts, lib/{api,components,stores,types,utils,server}, adapter-node, Bun)
- ใช้ **theme (SCSS + partials + assets)** จาก [cyber_admin_v2.0/template_html](/home/phibek/app/cyber_admin_v2.0/template_html) แทน theme ของ gateway-portal
- ย้าย business surfaces ของ klynx (pages, components, composables, stores, plugins, middleware, layouts, types, utils, i18n) มาเป็น Svelte ตาม mapping ใน §5
- ไม่แตะ `klynx-api` BE — FE เรียก contract เดิมผ่าน `lib/api/*.ts` (เลียนแบบ pattern gateway-portal)

---

## 2. Scope

### In Scope
- bootstrap SvelteKit project at `/home/phibek/app/` root (sibling ของ `cyber_admin_v2.0/` และ `docs/`)
- copy + ปรับ skeleton จาก gateway-portal (svelte.config.js, vite.config.ts, tsconfig.json, eslint.config.js, .prettierrc, hooks.server.ts, app.html, app.d.ts, project.inlang, scripts/mergeI18n.js, Dockerfile, k8s/, Jenkinsfile)
- copy theme `cyber_admin_v2.0/template_html/src/scss` → `src/scss/` แล้ว wire เข้า `app.html`/`+layout.svelte`
- port theme partials → Svelte components (`AppHeader`, `AppSidebar`, `AppTopNav`, `AppFooter`, `AppThemePanel`, `AppLoader`, `AppCover`, `AppScrollTopBtn`)
- port klynx domain pages → `src/routes/(app)/*` ตาม mapping §5
- port composables → Svelte 5 stores/runes (§6)
- port plugins (keycloak, mqtt, apexcharts, etc.) → SvelteKit equivalents (§7)
- port middleware → `hooks.server.ts` + per-group `+layout.server.ts` (§7)
- i18n: paraglide-js + `messages/{en,th}.json` (merge จาก klynx `i18n/`)
- static assets: `static/img`, `static/img/user`, vendor JS ที่ต้อง CDN/static
- `package.json` deps reconciled (Svelte equivalents ของ Vue libs — §8)

### Out of Scope
- เปลี่ยน BE contract / endpoint ของ `klynx-api`
- migration data store / DB schema
- CI/CD prod rollout (ทำเป็น follow-up)
- migrate `pages/changelog`, `pages/docs` content (จะ stub แล้วทำ phase 2)
- Unit tests สำหรับ composable parity (smoke + manual UAT พอ phase 1)

### Success Criteria
- `bun run dev` ขึ้นที่ port `PUBLIC_APP_BASE_PORT` ได้ และ render `(app)/dashboard` กับ theme cyber_admin
- `bun run build` + `bun run start` ผ่าน adapter-node
- Login flow ผ่าน Keycloak (silent SSO + bearer ไป BE) เหมือน klynx
- หน้าหลัก 5 หน้าแรก render สมบูรณ์: `dashboard`, `ksearch`, `kwatch`, `systemDevices`, `settings`
- `bun run check` (svelte-check) เขียวสนิท
- i18n สลับ en/th ได้

---

## 2A. Standard Cross-Repo Context

| Context | Default Value | Applies? | Notes |
|---|---|---|---|
| Feature owner backend | `klynx-api` | yes (consumer-only) | งานนี้ FE-only — ไม่แก้ BE |
| Events system of record | `gateway-api` | n/a | FE ไม่ผลิต event |
| Klynx normalized event consumer | `klynx-api` via `gw.events.normalized.v1` | n/a | FE ใช้ผ่าน klynx-api REST/MQTT เดิม |
| Device/camera identity SoT | `gateway-api/device_management` | yes | FE projection only |
| Klynx camera model | projection | yes | FE projection only |
| Frontend contract rule | FE must not invent schema | yes | reuse ของเดิม; ห้าม invent endpoint ใหม่ |

---

## 3. Current State

### Source: `/home/klynx/klynx` (Nuxt 4)
```text
app/
  pages/   {index,dashboard,profile,settings,login,live,map,mqtt,videowall,
            biDash,floorPlans,polices,pricing,subscription,watchman,
            ksearch,kwatch,kcontrol,edge-ai,ingest,police,systemDevices,
            systemUsers,admin,changelog,docs,floorPlans,profile,auth}
  components/{home,dashboard,kcontrol,watchman,permissions,prose,saas,
              settings,systemDevices,systemUsers}
  composables/  (24 files — useApi, useAuthImage, useBilling, useBranding,
                 useDashboard, useFloorPlanApi, useKcontrolDashboard,
                 useLicense, useMqttTopic, useNotify, useOrganization,
                 UsePermission, useStreamUrl, useSubscription, ...)
  stores/auth/   (Pinia)
  middleware/    (auth.global, licenseAdmin, platformLicense, transitions.global)
  plugins/       (apexcharts.client, block-ws.client, guard-on-ready.client,
                  initAuth.client, keycloak.client, locale-sync.client,
                  mqtt.client)
  layouts/       (default, login, live, chats, changelog, docs, landing)
  types/, utils/, assets/css/
i18n/            (Nuxt i18n)
```

### Skeleton reference: `/home/phibek/gateway-portal` (SvelteKit 2)
```text
src/
  app.html, app.d.ts, hooks.server.ts, jsvectormap.d.ts
  lib/
    api/        (aiMapping, authGuard, entitlement, ingest, org, settings,
                 subscription, target, user, workspace)
    components/ {app, bootstrap, filters, leaflet, plugins}
    stores/, styles/, i18nClient/, utils/, types/, server/
  routes/
    (app)/   (dashboard, profile, settings, subscription, subscriptions,
              workspaces, orgs, ingest, delivery)
    (base)/  (auth/{login,error,callback}, api/)
    (public)/(error, comingsoon, documentation)
  scss/    (app, layout, ui, pages, plugins, mixins, widget, images,
            _variables, _variables-dark, _root, _reboot, _functions,
            _utilities, _helper, font, styles)
i18n/{en,th}, messages/{en,th}.json, project.inlang/, scripts/mergeI18n.js
svelte.config.js, vite.config.ts, tsconfig.json, eslint.config.js
```

### Theme reference: `/home/phibek/app/cyber_admin_v2.0/template_html`
```text
src/
  scss/    (app, layout, ui, pages, plugins, mixins, widget, images,
            _variables, _root, _reboot, _functions, _utilities, _helper,
            font, styles)         ← เกือบเหมือน gateway-portal scss tree
  html/    (60+ pages including index, layout_*, page_*, profile, settings,
            map, calendar, chart_*, table_*, form_*, ai_*, pos_*, ...)
  html/partials/ (app-cover, app-footer, app-header, app-loader,
                  app-scroll-top-btn, app-sidebar, app-theme-panel,
                  app-top-nav, head, script)
  js/, img/, data/
package.json (vendor: bootstrap 5.3, fullcalendar, datatables, apexcharts,
              jquery, jvectormap-next, summernote, picmo, photoswipe, ...)
```

### Constraints
- Svelte 5 ใช้ runes (`$state`, `$derived`) — composables ต้อง refactor (Pinia → Svelte stores; Vue `ref/reactive` → runes)
- gateway-portal ใช้ paraglide v2 (compile-time messages); klynx i18n ใช้ Vue i18n format → ต้อง normalize JSON
- cyber_admin theme พึ่ง jQuery + plugin global พอสมควร (DataTables, Summernote) — เลือกใช้เฉพาะที่จำเป็น (Bootstrap 5.3 + Iconify + ApexCharts + Leaflet + Perfect Scrollbar) ตาม gateway-portal stack เพื่อไม่พ่วง jQuery; plugin เฉพาะหน้าค่อย lazy-import
- klynx ใช้ Keycloak silent SSO + cookie bridge — ต้อง replicate ใน `hooks.server.ts` + `(base)/auth/callback/+page.svelte`
- MQTT (`mqtt.js` over WSS), FLV (`flv.js`), HLS (`hls.js`), WebRTC ต้องเป็น client-only modules

### Risks
- ปริมาณหน้าจาก klynx เยอะ (~17 domain folders) — port ทีเดียวจะใหญ่; ต้องแบ่ง slice (§9)
- Pinia → Svelte stores: ลำดับ init / cross-store dependency อาจแตกถ้าไม่ระวัง
- cyber_admin SCSS variables อาจชนกับ gateway-portal patterns ที่ component ของ gateway-portal เคยอ้าง — ต้อง verify ทุก component port มี variable รองรับ
- Keycloak token + httpOnly cookie + bearer forward to klynx-api ต้องตรงกับ klynx เดิม (silent SSO + refresh) เพื่อไม่ให้ user ต้อง login ใหม่

---

## 4. Target Architecture

```text
/home/phibek/app/
├── package.json          ← Svelte stack (เลียน gateway-portal + เพิ่ม klynx-only deps)
├── svelte.config.js      ← adapter-node + paraglide alias
├── vite.config.ts        ← sveltekit + paraglide + dev port
├── tsconfig.json, eslint.config.js, .prettierrc
├── hooks.server.ts       ← session/keycloak/locale (ปรับจาก gateway-portal)
├── app.html              ← head + body class skeleton ของ cyber_admin
├── app.d.ts
├── project.inlang/       ← paraglide config
├── i18n/{en,th}/*.json   ← source (ทำงานสะดวก)
├── messages/{en,th}.json ← merged (paraglide source)
├── scripts/mergeI18n.js  ← copy from gateway-portal
├── src/
│   ├── lib/
│   │   ├── api/          ← REST clients (ofetch-style → SvelteKit fetch)
│   │   ├── components/
│   │   │   ├── app/      ← AppHeader, AppSidebar, AppTopNav, AppFooter,
│   │   │   │              AppThemePanel, AppLoader, AppCover,
│   │   │   │              AppScrollTopBtn (จาก theme partials)
│   │   │   ├── bootstrap/← Bootstrap wrapper
│   │   │   ├── plugins/  ← PerfectScrollbar, Iconify, Lity, ApexChart
│   │   │   ├── leaflet/  ← Map
│   │   │   ├── home/     ← klynx home/landing
│   │   │   ├── dashboard/← klynx dashboard
│   │   │   ├── iotControl/, watchman/, systemUsers/, systemDevices/,
│   │   │   │   permissions/, settings/, prose/, saas/
│   │   │   └── shared/   ← AlertCard, ConfirmModal, FlvPlayer, HlsPlayer,
│   │   │                  WebRTCPlayer, VideoPlayer, NotificationsSlideover,
│   │   │                  TeamsMenu, UserMenu, ShowImageDialog, SelectORG
│   │   ├── stores/       ← appOptions, appSidebarMenus, activeWorkspace,
│   │   │                   auth, license, branding, notify, mqtt
│   │   ├── i18n/         ← paraglide output (gen)
│   │   ├── api/...       (above)
│   │   ├── server/       ← keycloak helpers, session
│   │   ├── types/        ← navigation, dashboard, klynx domain types
│   │   └── utils/        ← asset, fetch, date, mqttTopic, streamUrl
│   ├── routes/
│   │   ├── +layout.svelte         ← global wrapper (theme classes, paraglide locale)
│   │   ├── +layout.server.ts      ← session bootstrap
│   │   ├── +page.svelte           ← redirect → /dashboard
│   │   ├── (app)/
│   │   │   ├── +layout.svelte     ← AppHeader+Sidebar+TopNav+Footer shell
│   │   │   ├── +layout.server.ts  ← guard auth
│   │   │   ├── dashboard/, aiSearch/, iotWatch/, iotControl/, edge-ai/,
│   │   │   │   ingest/, floorPlans/, police/, profile/, settings/,
│   │   │   │   systemUsers/, systemDevices/, admin/
│   │   │   └── live/, map/, videowall/, mqtt/, biDash/, polices/,
│   │   │       pricing/, subscription/, watchman/
│   │   ├── (base)/
│   │   │   └── auth/{login,callback,error}/+page.svelte
│   │   └── (public)/
│   │       ├── error/, comingsoon/, changelog/, docs/, landing/
│   ├── scss/                       ← จาก cyber_admin_v2.0/template_html/src/scss
│   │   (app, layout, ui, pages, plugins, mixins, widget, images,
│   │    _variables, _root, _reboot, _functions, _utilities, _helper,
│   │    font, styles.scss)
│   └── jsvectormap.d.ts (ถ้าใช้)
├── static/
│   ├── img/              ← จาก cyber_admin_v2.0/template_html/src/img + klynx logos
│   └── plugins/          ← static vendor ที่ไม่อยากให้ Vite bundle
├── Dockerfile, .dockerignore
├── k8s/, Jenkinsfile
├── .env, .env.example
└── (ทิ้ง cyber_admin_v2.0/ ไว้เป็น reference; gitignore ภายหลัง)
```

---

## 5. Klynx → SvelteKit Mapping

### Pages → routes

| klynx (`app/pages/`) | SvelteKit route | route group | layout |
|---|---|---|---|
| `index.vue` | `/` (redirect) | root | default |
| `login.vue` | `/auth/login` | (base) | base |
| `dashboard.vue` | `/dashboard` | (app) | app |
| `profile/*` | `/profile/*` | (app) | app |
| `settings/*` | `/settings/*` | (app) | app |
| `live.vue`, `map.vue`, `mqtt.vue`, `videowall.vue` | `/{live,map,mqtt,videowall}` | (app) | app/live for live |
| `biDash.vue`, `floorPlans/*`, `floorPlans.vue` | `/biDash`, `/floorPlans` | (app) | app |
| `ksearch/*` | `/aiSearch/*` (rebrand) | (app) | app |
| `kwatch/*`, `watchman.vue` | `/iotWatch/*` (rebrand), `/watchman` | (app) | app |
| `kcontrol/*` | `/iotControl/*` (rebrand) | (app) | app |
| `edge-ai/*` | `/edge-ai/*` | (app) | app |
| `ingest/*` | `/ingest/*` | (app) | app |
| `police/*`, `polices.vue` | `/police/*`, `/polices` | (app) | app |
| `systemDevices/*` | `/systemDevices/*` | (app) | app |
| `systemUsers/*` | `/systemUsers/*` | (app) | app |
| `admin/*` | `/admin/*` | (app) | app |
| `subscription.vue`, `pricing.vue` | `/subscription`, `/pricing` | (app) | app |
| `changelog/*` | `/changelog/*` | (public) | changelog |
| `docs/*` | `/docs/*` | (public) | docs |
| `auth/*` | `/auth/*` | (base) | auth |

### Composables → stores / utils

| klynx composable | Svelte target | shape |
|---|---|---|
| `useApi.ts` | `lib/utils/fetch.ts` (+ per-domain `lib/api/*.ts`) | function |
| `useAuthImage.ts` | `lib/utils/authImage.ts` | function |
| `useBilling.ts`, `useBillingStatus.ts`, `useSubscription.ts`, `useLicense.ts` | `lib/stores/billing.ts`, `lib/api/billing.ts` | store + api |
| `useBranding.ts` | `lib/stores/branding.ts` | store |
| `useDashboard.ts`, `useBiDashTimeseries.ts`, `useKcontrolDashboard.ts` | `lib/api/{dashboard,iotControlDashboard}.ts` + per-page `+page.ts` load | function |
| `useFloorPlanApi.ts`, `useFloorPlanError.ts` | `lib/api/floorPlan.ts` | function |
| `useHighlighter.ts`, `useTypingEffect.ts` | `lib/utils/*.ts` | function |
| `useKcontrolDockState.ts`, `useMapCenter.ts`, `useStreamUrl.ts` | `lib/stores/iotControlDock.ts`, `lib/stores/mapCenter.ts`, `lib/utils/streamUrl.ts` | store + util |
| `useLLM.ts`, `useChats.ts`, `useAnalytics.ts` | `lib/api/*.ts` + store | mixed |
| `useMqttTopic.ts` | `lib/stores/mqtt.ts` (singleton client) | store + helper |
| `useNotify.ts` | `lib/stores/notify.ts` (toasts) | store |
| `useOrganization.ts`, `usePhibekWorkspace.ts` | `lib/stores/activeWorkspace.ts` | store (เลียน gateway-portal) |
| `UsePermission.ts` | `lib/stores/permission.ts` + `lib/server/permify.ts` | store + server util |
| `useProcessAuthCallback.ts` | `(base)/auth/callback/+page.svelte` (load + onMount) | route |
| `useSSE.ts` | `lib/utils/sse.ts` | function |
| `useWeather.ts` | `lib/api/weather.ts` | function |
| `useCameraUsageExport.ts`, `useAdminCameraCredentials.ts`, `useCustomerAccount.ts`, `composables/systemUsers/*` | `lib/api/*.ts` + page-local helpers | function |

### Stores (Pinia → Svelte stores)

| klynx | Svelte | type |
|---|---|---|
| `stores/auth/*` (Pinia) | `lib/stores/auth.ts` (writable session + derived `isAuthed`, `roles`) | writable + derived |
| layout/app options (Nuxt UI) | `lib/stores/appOptions.ts`, `lib/stores/appSidebarMenus.ts` (จาก gateway-portal pattern) | writable |
| color-mode (`@nuxtjs/color-mode`) | `lib/stores/theme.ts` (light/dark/system + `body.classList`) | writable |
| `activeOrg` / workspace | `lib/stores/activeWorkspace.ts` (gateway-portal pattern) | writable + setter |

### Middleware → hooks

| klynx middleware | Svelte equivalent | location |
|---|---|---|
| `auth.global.ts` | guard ใน `hooks.server.ts` + `(app)/+layout.server.ts` redirect | server hook |
| `licenseAdmin.ts` | `+layout.server.ts` ของ `(app)/admin/` (load license + check role) | route load |
| `platformLicense.ts` | `lib/server/license.ts` + `(app)/+layout.server.ts` (set locals) | server util |
| `transitions.global.ts` | Svelte view transitions API ใน `+layout.svelte` | client |

### Plugins → SvelteKit init

| klynx plugin | Svelte | trigger |
|---|---|---|
| `keycloak.client.ts`, `initAuth.client.ts`, `guard-on-ready.client.ts` | `lib/server/keycloak.ts` (server) + `lib/client/keycloak.ts` (silent SSO) + `hooks.server.ts` | server boot + client onMount |
| `mqtt.client.ts`, `block-ws.client.ts` | `lib/stores/mqtt.ts` (singleton, client-only `if (browser)`) | client onMount |
| `apexcharts.client.ts` | `lib/components/plugins/Apex.svelte` (dynamic import) | per-component |
| `locale-sync.client.ts` | paraglide locale + cookie sync ใน `+layout.svelte` | client |

---

## 6. Theme Integration Strategy

### SCSS layer
1. คัด `cyber_admin_v2.0/template_html/src/scss/*` → `src/scss/*`
2. ตรวจ `_variables.scss` และเพิ่ม `_variables-dark.scss` (เลียน gateway-portal) ให้ split light/dark
3. แก้ `app/_app.scss` ให้รับ `app-header-height`, `app-sidebar-width` ตามค่าของ cyber_admin
4. import `src/scss/styles.scss` ใน root `+layout.svelte` (`<script>import '../scss/styles.scss'`)
5. expose CSS variables ที่ component ใช้ (`--bs-theme`, `--app-component-bg`, etc.) เลียน gateway-portal เพื่อให้ component ที่ port มาใช้ได้ทันที

### Partials → Svelte components
| theme partial | Svelte component | source ref |
|---|---|---|
| `app-header.html` | `lib/components/app/AppHeader.svelte` | merge gateway-portal AppHeader logic + cyber_admin markup |
| `app-sidebar.html` | `lib/components/app/AppSidebar.svelte` | gateway-portal AppSidebar + cyber_admin styling |
| `app-top-nav.html` | `lib/components/app/AppTopNav.svelte` | gateway-portal + cyber markup |
| `app-footer.html` | `lib/components/app/AppFooter.svelte` | direct |
| `app-theme-panel.html` | `lib/components/app/AppThemePanel.svelte` | gateway-portal AppThemePanel |
| `app-loader.html` | `lib/components/app/AppLoader.svelte` | static |
| `app-cover.html` | `lib/components/app/AppCover.svelte` | static |
| `app-scroll-top-btn.html` | `lib/components/app/AppScrollTopBtn.svelte` | gateway-portal NavScrollTo |
| `head.html`, `script.html` | merge เข้า `app.html` | direct |

### Vendor stack (เลือกเฉพาะที่ใช้)
- เก็บ: bootstrap 5.3, bootstrap-icons, @iconify/svelte, apexcharts + svelte-apexcharts, chart.js, leaflet, jsvectormap, perfect-scrollbar, lity, sass, @fortawesome/fontawesome-free
- ไม่เอา: jquery + datatables (ทำเป็น svelte component ภายหลัง), summernote, picmo, photoswipe, masonry, spectrum-colorpicker, jvectormap-next (ใช้ jsvectormap), bootstrap-table, fullcalendar (ค่อย opt-in)
- เพิ่มจาก klynx: `keycloak-js`, `mqtt`, `flv.js`, `hls.js`, `video.js`, `marked`, `xlsx`, `date-fns`, `date-fns-tz`, `zod`, `@googlemaps/js-api-loader`, `@googlemaps/markerclusterer`

---

## 7. Auth + Session Strategy

```text
client                                server (SvelteKit hooks)             klynx-api / Keycloak
─────                                 ──────────────────────────           ────────────────────
load /(app)/...
   └─ +layout.server.ts                event.locals.session check
        └─ if no cookie → redirect /(base)/auth/login
                          ↓
client mounts /auth/login
   └─ keycloak-js silent SSO (iframe)
        └─ token → POST /api/auth/exchange  hooks.server.ts: handle()
                                            └─ verify token vs Keycloak
                                            └─ set httpOnly cookie (sid)
                                            └─ return 200
   └─ goto /dashboard
                                        +layout.server.ts: load user profile
                                            └─ fetch klynx-api /me with Bearer
                                            └─ pass page.data.user
```

- `hooks.server.ts`: parse cookie → resolve session → set `event.locals.session`/`user`. Forward `Authorization: Bearer <jwt>` + `X-Active-Org` ไปที่ klynx-api ผ่าน `lib/api/*.ts` ที่รับ `event.fetch`
- silent SSO refresh: `lib/client/keycloak.ts` เริ่ม `init({ onLoad: 'check-sso', silentCheckSsoRedirectUri })`; ถ้า token ใกล้หมด → call `/api/auth/refresh`
- logout: `/api/auth/logout` POST → clear cookie + Keycloak end-session redirect

---

## 8. Dependencies (target `package.json`)

### devDependencies (เหมือน gateway-portal)
```
@eslint/compat, @eslint/js, @inlang/cli, @inlang/paraglide-js,
@sveltejs/adapter-auto, @sveltejs/adapter-node, @sveltejs/kit,
@sveltejs/vite-plugin-svelte, @types/leaflet, @types/node,
eslint, eslint-plugin-svelte, globals, prettier, prettier-plugin-svelte,
svelte ^5, svelte-check, typescript, typescript-eslint, vite ^7
```

### dependencies (gateway-portal core + klynx ports)
```
gateway-portal core:
  @fortawesome/fontawesome-free, @iconify/svelte, apexcharts, bootstrap,
  bootstrap-icons, chart.js, jsvectormap, leaflet, lity, perfect-scrollbar,
  sass, svelte-apexcharts, svelte-highlight

klynx ports:
  keycloak-js, mqtt, flv.js, hls.js, video.js, marked, xlsx, zod,
  date-fns, date-fns-tz, @googlemaps/js-api-loader,
  @googlemaps/markerclusterer, leaflet.markercluster
```

---

## 9. Phased Rollout

> ตาม CLAUDE.md §"Task budget" — split slice ที่ ship + UAT ได้แต่ละ phase

### Phase 0 — bootstrap ✅ Done 2026-05-06
- [x] วาง plan
- [x] copy skeleton (svelte.config, vite.config, tsconfig, eslint, prettier, hooks.server, app.html, app.d.ts, project.inlang, scripts/mergeI18n.js)
- [x] copy `cyber_admin_v2.0/template_html/src/scss/` → `src/scss/` + img → `static/img/`
- [x] route shell `(app)/(base)/(public)` + `+page.svelte` redirect /dashboard
- [x] port `AppHeader/Sidebar/TopNav/Footer/ThemePanel` จาก gateway-portal
- [x] `bun install` 410 packages, `bun run dev` ขึ้น port 3001 ผ่าน

### Phase 1 — auth + i18n ✅ Done 2026-05-06
- [x] `lib/client/keycloak.ts` (port `keycloak.client` + `initAuth` + `useProcessAuthCallback`)
- [x] `(base)/auth/{login,callback,error}/+page.svelte` + `/auth/session` POST + `/api/auth/logout`
- [x] `auth.global.ts` middleware → `hooks.server.ts` + `(app)/+layout.server.ts` (cookie validate via jose)
- [x] paraglide `messages/{en,th}.json` (1528 keys merged) — klynx `i18n/lang/*.ts` migration deferred
- [x] `lib/stores/notify.ts` + `Toaster.svelte` mounted at root
- **exit met:** unauthorized → 302 chain → `/auth/login` cyber_admin shell renders

### Phase 2 — domain shell #1 ✅ Done 2026-05-06
- [x] `lib/utils/fetch.ts` (port `useApi`, auto Bearer + X-Active-Org, FormData support)
- [x] `lib/api/{dashboard,profile,branding,workspace}.ts` — workspace.ts rewritten to call klynx `/orgs/`
- [x] `lib/stores/branding.ts` + `lib/types/branding.ts` (with `applyToDom` for primary color + favicon)
- [x] `dashboard/+page.svelte` — 5 KPI cards + scope toggle (All/Public/Managed) + refresh
- [x] `profile/+page.svelte` — account read-only + personal form (firstName/lastName/locale)
- [x] `settings/+page.svelte` — appearance (locale + theme mode) + branding read + map placeholder
- [x] `package.json` `i18n:compile` script chain
- [x] `.env` wired to klynx-api production (kc.k-lynx.com sso/realm/fe + api/v1 + mqtt)
- **exit met:** all 3 pages render + auth-gated, 1564 keys, 0 type errors

### Phase 3 — realtime + media + brand ✅ Done 2026-05-06
- [x] **PHIBEK CI applied** — Sass vars `$phibek-{navy,oracle-gold,foresight-gold,wisdom-cream}` + CSS custom props in `_root.scss`. `$primary` = Oracle Gold, `$theme` = Foresight Gold, `$body-bg` = Phibek Navy mix. Title "PHIBEK · winn".
- [x] `lib/stores/mqtt.ts` — singleton `MqttClient` (lazy import `mqtt`, browser-only) + `subscribeMqtt()` w/ `+`/`#` wildcard + `mqttStatus`/`mqttLastError`/`mqttConnected`/`decodeJson()`
- [x] `lib/utils/streamUrl.ts` (port `useStreamUrl` — `createStream()`, `buildWebRTCUrlByIdStrict()`, `toAbsoluteMediaUrl()` + 403 toast)
- [x] `lib/utils/sse.ts` (port `useSSE` — `subscribeSse()` + `buildSseUrl()`)
- [x] `lib/components/shared/{FlvPlayer,HlsPlayer,WebRTCPlayer,VideoPlayer}.svelte` — Svelte 5 runes, lazy imports, `start(url)/stop()` exports
- [x] `static/js/ZLMRTCClient.js` (298KB copied from klynx) for WebRTC ZLM mode
- [x] `static/img/logo/phibek-mark.svg` placeholder + drop-in README
- [x] `(app)/live/+page.svelte` smoke surface — MQTT subscribe + media player probe
- **exit met:** `bun run check` 0/0 (2483 files), brand visible in HTML; **MQTT/WebRTC live test deferred** (requires VPN to istio.k-lynx.com)

### Phase 4 — domain shell #2 — domain rebrand ✅ Done 2026-05-06
> **Naming rule:** klynx FE folder names rebrand on import. See [feedback_domain_naming](../../../.claude/projects/-home-phibek-app/memory/feedback_domain_naming.md).
> - `ksearch` → **`aiSearch`** · `kwatch` → **`iotWatch`** · `kcontrol` → **`iotControl`**
> - Backend Kafka topic + REST path names stay original.

- [x] port `ksearch/*` → `(app)/aiSearch/+page.svelte` (chats list via `/ksearch/chats`)
- [x] port `kwatch/*` → `(app)/iotWatch/+page.svelte` (watchman entries; stub when env unset)
- [x] port `kcontrol/*` → `(app)/iotControl/{,events,logs,map,sop}/+page.svelte` (overview KPI + live MQTT + resource list + level-filtered logs)
- [x] port `systemDevices/{cameras,edge,groups}` + `systemUsers/{users,organizations,unit,permissions}` (with tabs)
- [x] `lib/api/{aiSearch,iotControl,iotWatch,devices,klynxUser}.ts` (5 modules)
- [x] `lib/components/shared/{DomainStarter,DataTableStarter}.svelte` reusable starter shell
- [x] `appSidebarMenus.ts` rewritten to PHIBEK navigation (gateway-portal Events/Delivery/Workspaces removed)
- **exit met:** 14 routes, all HTTP 200 with mock JWT, sidebar render correct

### Phase 5 — domain shell #3 ✅ Done 2026-05-06
- [x] port `edge-ai/*` → `(app)/edge-ai/+page.svelte` (4 KPI + top events table) via `/dashboard/summary`
- [x] port `ingest/*` → `(app)/ingest/{,dashboard}/+page.svelte` via `/events` + `/events/dashboard`
- [x] port `floorPlans/*` → `(app)/floorPlans/{,[id]}/+page.svelte` (card grid + image with marker pins)
- [x] port `police/*` → `(app)/police/+page.svelte` (watchlist table) via `/kwatch/watchlist`
- [x] port `polices` (police mode) → `(app)/polices/+page.svelte` (live MQTT feed: `kwatch.watchlist`/`kalert`/`kdetect`)
- [x] port `admin/*` → `(app)/admin/{,licenses,platform-license}/+page.svelte` (current license + activate/validate flow)
- [x] `lib/api/{edgeAi,klynxIngest,floorPlan,police,adminLicense}.ts`
- [x] sidebar Operations + Admin sections
- **exit met:** 10 routes, all HTTP 200

### Phase 6 — secondary surfaces ✅ Done 2026-05-06
- [x] `(app)/mqtt` — full klynx port (subscribe + publish console with JSON pretty-print)
- [x] `(app)/watchman` — full klynx port (iframe wrapper with `?url=` param)
- [x] `(app)/videowall` — working starter (2x2/3x3/4x4 layout + click-to-start tiles via `createStream()`)
- [x] `(app)/map`, `(app)/biDash` — placeholders with explanatory cards (heavy klynx pages 1.9k+3.8k LOC deferred)
- [x] `(app)/subscription` — current plan + usage/limits progress bars
- [x] `(app)/pricing` — public packages + Monthly/Yearly toggle + checkout via `startCheckout()`
- [x] `(public)/landing` — CI-styled hero (navy → black gradient, gold mark, dual CTA)
- [x] `(public)/changelog/{,[...slug]}` — release notes index + per-version stub
- [x] `(public)/docs/{,[...slug]}` — section card grid + slug stub (markdown loader follow-up)
- [x] `lib/api/klynxSubscription.ts` (`listPackages`, `getCurrentSubscription`, `startCheckout`, `verifyCheckout`)
- [x] `hooks.server.ts` public allowlist updated for `/changelog`, `/docs`, `/silent-check-sso.html`
- **exit met:** 13 routes, all HTTP 200 (incl. 5 public no-auth)

### Phase 7 — deploy + close ✅ Done 2026-05-06
- [x] `Dockerfile` (multi-stage `oven/bun:1.2-debian` → `node build/index.js`, `EXPOSE 3001`)
- [x] `.dockerignore` (excludes node_modules / .svelte-kit / build / docs / theme reference / claude artifacts)
- [x] `.env.prod` (mirrors klynx-api production: kc/api/mqtt URLs)
- [x] `k8s/deployment.yaml` + `k8s/referencegrant.yaml` (namespace `gw`, harbor registry `regis.pointit.co.th/phibek/phibek-app`)
- [x] `Jenkinsfile` (build with `--build-arg` for public env, push, bump `k8s/deployment.yaml` image tag)
- [x] `README.md` + `CHANGELOG.md` (top-level)
- [x] `bun run check` 0/0 · `bun run lint` 0/0 · `bun run build` succeeds (`build/index.js` 9.9KB + `build/server` 648KB)
- [x] Smoke prod runtime: `node build/index.js` serves /landing /dashboard /aiSearch /iotControl /admin/platform-license /docs/* in 6–138ms
- [x] Plan moved to `docs/plan/done/`
- **exit met:** prod build green, deploy artifacts in place; ready for `git init` + remote push when org chooses.

---

## 10. Validation Checklist

- [ ] `bun install` no errors
- [ ] `bun run dev` ขึ้น port `PUBLIC_APP_BASE_PORT`
- [ ] `bun run build` ผ่าน
- [ ] `bun run start` (adapter-node) serve ได้
- [ ] `bun run check` (svelte-check) เขียว
- [ ] `bun run lint` เขียว
- [ ] Login Keycloak → cookie set → redirect /dashboard
- [ ] dashboard, ksearch, kwatch, kcontrol, systemDevices ขึ้น layout cyber_admin
- [ ] Sidebar collapse / dark mode toggle ทำงาน
- [ ] i18n EN ↔ TH สลับ + persist
- [ ] MQTT realtime topic subscribe success
- [ ] FLV/HLS/WebRTC player render stream
- [ ] Logout → clear cookie → Keycloak end-session

---

## 11. Decision Points

1. **Keep cyber_admin SCSS or merge with gateway-portal SCSS?** — ใช้ cyber_admin เป็น base (per requirement) แต่ขโมย `_variables-dark.scss` จาก gateway-portal เพื่อรองรับ dark mode
2. **jQuery / DataTables / FullCalendar?** — ตัดทิ้งใน Phase 0; ถ้าหน้าใดต้องการให้ใช้ Svelte equivalents (svelte-headless-table, fullcalendar/svelte) ใน slice นั้น ๆ
3. **เก็บ `klynx` route shape เดิม (เช่น `/biDash`) หรือ refactor เป็น `/dashboard/bi`?** — เก็บเดิม phase 1; refactor เป็น follow-up หลัง UAT
4. **Composable ที่มี Vue-only ecosystem (เช่น `useTypingEffect`)** — port เป็น Svelte action (`use:typing`) แทน
5. **Bun vs Node?** — Bun เหมือน gateway-portal (lockfile, scripts) แต่ runtime ใช้ adapter-node → docker base = node 22-alpine

---

## 12. Rollback / Risk

- งานนี้สร้างของใหม่ที่ `/home/phibek/app` — ไม่กระทบ klynx เดิม. Rollback = ลบ src/ + รีเซ็ตจาก phase ก่อนหน้า
- ระหว่าง phase 1-6, klynx เดิมยังรันอยู่ปกติ; ทำ UAT คู่ขนาน
- ก่อน cut over จริง: ทำ feature parity matrix (page-level) ให้ user สแตมป์
- Keycloak realm + client config ใช้ของเดิมของ klynx (ห้ามแก้) — เพิ่ม redirect URI ใหม่สำหรับ `/auth/callback` ของ app นี้เท่านั้น

---

## 13. Out-of-band Follow-ups

- ตั้ง CI (Jenkins / GH Actions) แยกจาก gateway-portal
- เขียน unit tests สำหรับ store + util ที่ port มา
- migrate content `pages/changelog`, `pages/docs` (Markdown) — ใช้ mdsvex หรือ direct fetch markdown
- เปลี่ยน `useApi` พ่วง `ofetch` เป็น native `fetch` + `event.fetch` ทุกที่
- documentation refresh (README, CLAUDE.md ของ FE repo)

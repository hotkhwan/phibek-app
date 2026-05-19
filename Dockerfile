# --- Stage 1: Build the SvelteKit application ---
FROM docker.io/oven/bun:1.2-debian AS builder

# Build-time public env (compiled into the bundle by Vite)
ARG PUBLIC_APP_BASE_PORT=3001
ARG PUBLIC_APP_BASE_PATH=/
ARG PUBLIC_KC_URL
ARG PUBLIC_KC_REALM
ARG PUBLIC_KC_CLIENT_ID
ARG PUBLIC_API_BASE_URL
ARG PUBLIC_REALTIME_HUB_ENABLED=true
ARG PUBLIC_MQTT_URL
ARG PUBLIC_MQTT_USERNAME
ARG PUBLIC_MQTT_PASSWORD
ARG NUXT_PUBLIC_MQTT_URL
ARG NUXT_PUBLIC_MQTT_USERNAME
ARG NUXT_PUBLIC_MQTT_PASSWORD
ARG PUBLIC_METABASE_EMBED_URL

ENV PUBLIC_APP_BASE_PORT=$PUBLIC_APP_BASE_PORT \
    PUBLIC_APP_BASE_PATH=$PUBLIC_APP_BASE_PATH \
    PUBLIC_KC_URL=$PUBLIC_KC_URL \
    PUBLIC_KC_REALM=$PUBLIC_KC_REALM \
    PUBLIC_KC_CLIENT_ID=$PUBLIC_KC_CLIENT_ID \
    PUBLIC_API_BASE_URL=$PUBLIC_API_BASE_URL \
    PUBLIC_REALTIME_HUB_ENABLED=$PUBLIC_REALTIME_HUB_ENABLED \
    PUBLIC_MQTT_URL=$PUBLIC_MQTT_URL \
    PUBLIC_MQTT_USERNAME=$PUBLIC_MQTT_USERNAME \
    PUBLIC_MQTT_PASSWORD=$PUBLIC_MQTT_PASSWORD \
    NUXT_PUBLIC_MQTT_URL=$NUXT_PUBLIC_MQTT_URL \
    NUXT_PUBLIC_MQTT_USERNAME=$NUXT_PUBLIC_MQTT_USERNAME \
    NUXT_PUBLIC_MQTT_PASSWORD=$NUXT_PUBLIC_MQTT_PASSWORD \
    PUBLIC_METABASE_EMBED_URL=$PUBLIC_METABASE_EMBED_URL

WORKDIR /app

# Lockfile + manifest first for cacheable installs
COPY package.json bun.lock ./

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN bun install --frozen-lockfile

# Source
COPY . .

# i18n: merge JSON sources → messages/ → paraglide compile
RUN bun run i18n:merge \
    && bunx paraglide-js compile --project ./project.inlang --outdir ./src/lib/i18n

# SvelteKit production build (adapter-node → ./build)
RUN bun run vite build

# --- Stage 2: Minimal runtime ---
FROM docker.io/oven/bun:1.2-debian

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    PUBLIC_APP_BASE_PORT=3001 \
    PUBLIC_APP_BASE_PATH=/ \
    PUBLIC_REALTIME_HUB_ENABLED=true

# procps is useful for k8s liveness debugging
RUN apt-get update && apt-get install -y --no-install-recommends \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
COPY --from=builder /app/build       ./build
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

# adapter-node listens on $PORT
CMD ["node", "build/index.js"]

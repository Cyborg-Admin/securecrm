# SecureCRM — production image for Coolify / Docker
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Keep `next build` offline from Coolify's injected prod DATABASE_URL.
ENV DB_DRIVER=sqlite
ENV SQLITE_PATH=/tmp/securecrm-build.sqlite
ENV DATABASE_URL=
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SQLITE_PATH=/app/data/securecrm.sqlite
ENV DB_DRIVER=sqlite

RUN mkdir -p /app/data \
  && chown -R node:node /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/database ./database
COPY --from=builder /app/extension ./extension
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]

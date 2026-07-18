# Statický katalog: build v Node, servírování přes Caddy.
# Build context = kořen apmm/ (kvůli seed datům backendu, ze kterých
# se katalog při buildu generuje).
FROM node:22-slim AS build
WORKDIR /apmm
COPY backend/data ./backend/data
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /apmm/frontend
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /apmm/frontend/dist /srv/www
COPY infra/Caddyfile /etc/caddy/Caddyfile

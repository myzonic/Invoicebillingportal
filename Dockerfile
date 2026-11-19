# syntax=docker/dockerfile:1

# ---------- Stage 1: build frontend ----------
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: build backend ----------
FROM node:20-alpine AS backend
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    FRONTEND_DIST=/app/frontend/dist \
    UPLOAD_DIR=/app/backend/uploads \
    PATH="/app/backend/node_modules/.bin:${PATH}"
# openssl/libc6-compat: Prisma engines. tini: forwards signals to the Node process.
RUN apk add --no-cache openssl libc6-compat tini
WORKDIR /app/backend
COPY --from=backend /app/package.json ./package.json
COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/dist ./dist
COPY --from=backend /app/prisma ./prisma
COPY --from=frontend /app/dist /app/frontend/dist
# The build stage installs node_modules as root. Prisma's CLI writes engine
# metadata at runtime (migrate deploy / db seed), so the non-root user must own
# node_modules too — otherwise it fails with "Can't write to .../@prisma/engines".
RUN mkdir -p /app/backend/uploads \
    && chown -R node:node /app/backend/uploads \
    && chown -R node:node /app/backend/node_modules
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/prisma db seed && exec node dist/server.js"]

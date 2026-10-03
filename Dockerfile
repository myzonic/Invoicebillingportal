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
RUN npx prisma generate
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app/backend
COPY --from=backend /app/package.json ./package.json
COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/dist ./dist
COPY --from=backend /app/prisma ./prisma
COPY --from=frontend /app/dist /app/frontend/dist
RUN mkdir -p /app/backend/uploads
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/server.js"]

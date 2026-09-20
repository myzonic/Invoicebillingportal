# Myzonic Finance & Billing Portal

Self-hosted, single-tenant invoicing + payments portal for **Myzonic.com**. React (Vite) frontend, Express + TypeScript + Prisma backend, PostgreSQL, and Square Web Payments.

Stack: Node 20, Express 4, TypeScript, Prisma 5, PostgreSQL 16, React 18, Redux Toolkit / RTK Query, Tailwind v4, pdf-lib.

## Repository layout

```
myzonic-portal/
  backend/            Express + Prisma API (port 3000, /api) + serves built frontend
    prisma/           schema + seed + migrations
    src/              routes, services (square, pdf, email), middleware
    .env.example      production environment template
  frontend/           Vite + React SPA (built into dist/, served by the backend)
    public/logo.jpg   fallback invoice logo
  Dockerfile          single-container build (frontend build -> backend build -> runtime)
  docker-compose.yml  postgres + app (reference / local test)
  .env.example        all environment variables
```

## How it connects

```
Browser <-> Backend (:3000, serves /api + built frontend + /uploads) <-> Postgres
                                        <-> Square API (checkout + webhooks)
```

The payment page always charges the client in **USD** (the merchant's USD Square account) while showing the amount in the client's local currency.

## Local development

- Backend: `cd backend && npm run dev` (port 3001, needs PostgreSQL + `.env`)
- Frontend: `cd frontend && npm run dev` (port 5173, proxies `/api` and `/uploads` to the backend)

## Deployment (Dokploy)

Single app + one PostgreSQL service.

1. Push this repo to GitHub.
2. In Dokploy: create a **PostgreSQL** service and note the connection string.
3. Create an **Application** from the GitHub repo (build = root `Dockerfile`).
4. Set the environment variables (see `backend/.env.example`):
   - `DATABASE_URL` (from the Dokploy Postgres service)
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SEED_ADMIN_PASSWORD`, `INVITE_TOKEN`
   - `CLIENT_URL`, `API_URL` = your public HTTPS domain
   - Square production: `SQUARE_ENVIRONMENT=production`, `SQUARE_APP_ID=sq0idp-69IRWFqy7jws1wyTknhLhw`, plus the live `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID` (USD).
- `SQUARE_WEBHOOK_SIGNATURE_KEY` is **required** — it is the signature key of your webhook subscription. Without it the app refuses to start, and the webhook endpoint rejects every request. Register `https://your-domain.com/api/webhooks/square` as the notification URL in the Square developer console, since that URL is part of the signed payload (override it with `SQUARE_WEBHOOK_URL` if the public URL differs from `API_URL`).
   - Optional `SMTP_*` for invoice emails.
5. Mount a persistent volume on `/app/backend/uploads` so uploaded logos survive restarts.
6. On start the container runs `prisma migrate deploy` + an idempotent seed, then starts the API.

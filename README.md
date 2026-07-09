# Kitchgoo

Restaurant management SaaS — POS & billing, kitchen display (KDS), menu,
inventory, delivery, staff, guests/CRM, reservations, reports, and a public
QR menu for guest ordering. Multi-tenant with a platform-admin console.

## Architecture

```
Browser (React 19 + Vite SPA, PWA)
   │  HttpOnly-cookie session, JSON
   ▼
Backend (Vercel serverless, Express)          Supabase (Postgres)
   api/auth.js    login/register/session ───►  users, accounts
   api/data.js    tenant data API        ───►  menu, inventory, orders,
   api/public.js  guest QR menu          ───►  settings, tenant_data
   api/help.js    AI copilot (Zeenie gateway)
```

- **The browser never queries the database.** All reads/writes go through
  the backend, which derives the tenant from the session JWT and scopes
  every query server-side. Run [supabase-rls.sql](supabase-rls.sql) so the
  anon key in the bundle has zero table access.
- **Sessions**: JWT in an HttpOnly cookie; passwords scrypt-hashed
  (legacy hashes migrate transparently on login).
- **Live sync**: after each write the backend fires a data-free
  `db_changed` broadcast on a Supabase realtime channel; clients refetch
  through the API (plus a 30s polling fallback).
- **Guest QR menu** (`/qrmenu/:tenant`): read-only public bootstrap plus
  server-side-merged single-table order writes — guests can't see other
  tables' orders or touch other tenants.
- **Demo mode**: fully offline, seeded into localStorage — no backend needed.
- **Frontend data layer**: [src/db/database.js](src/db/database.js) keeps an
  in-memory cache per tenant so page reads stay synchronous; writes update
  the cache optimistically and call the API.
- **Bounded data**: the default payload carries only the last 60 days of
  orders; Reports fetch older ranges on demand (`GET /api/data/orders`).
  The audit log is capped at 1,000 recent entries and completed KDS tickets
  are pruned after 7 days.
- **Atomic writes**: list collections are never written whole — every
  insert/update/delete merges a single item server-side
  (`/api/data/flex/:name`), so concurrent devices can't clobber each other.
- **Low egress**: a change broadcasts only the *name* of the collection that
  changed; clients refetch just that one collection (`GET /api/data/collection/:name`,
  ~1 KB) instead of the full ~84 KB payload. Polling only runs while realtime
  is disconnected. Images live in Supabase Storage (public bucket
  `kitchgoo-media`), not as base64 inside rows, so photos don't re-ship on
  every sync — run `node migrate-images.mjs` once (needs
  `SUPABASE_SERVICE_ROLE_KEY`) to move any existing embedded images.
- **Code splitting**: each page ships as its own chunk (entry ~280 KB
  instead of a single 1.25 MB bundle).
- **Tests**: `npm test` (vitest) covers the date logic, payload
  sanitizers/mappers, and password hashing.

## Setup

1. `npm install`
2. Create a [Supabase](https://supabase.com) project, run
   `supabase-schema.sql` then `supabase-rls.sql` in the SQL editor.
3. Copy `.env.example` → `.env` and fill in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (realtime only)
   - `SUPABASE_SERVICE_ROLE_KEY` (backend data access)
   - `JWT_SECRET` (`openssl rand -hex 32`) — required in production
   - `ZEENIE_API_KEY` for the AI copilot (Zenoti internal LLM gateway;
     raise a Jira ticket for access)
4. `npm run dev` — the Vite dev server mounts the full backend, so the API
   works locally without the vercel CLI.

## Deploy

Deployed on Vercel; `vercel.json` routes `/api/*` to the serverless
functions and everything else to the SPA. Set the env vars from step 3 in
the Vercel project settings.

## Design system

The UI follows "The Pass" design system (bistro pine, porcelain tile, brass
rail accents, mono numerals) — see
[design-system/kitchgoo/MASTER.md](design-system/kitchgoo/MASTER.md).

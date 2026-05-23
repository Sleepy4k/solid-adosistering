# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start dev server (Vite)
bun run build        # Production build
bun run start        # Start production server (node server.mjs)
bun run check        # tsc --noEmit + lint + format (run before committing)
bun run lint         # ESLint --fix + Prettier write
bun run db:generate  # Regenerate Prisma client after schema changes
bun run db:migrate   # Run migrations (dev)
bun run db:seed      # Seed the database (bun prisma/seed.ts)
```

## Architecture

**Stack**: SolidJS + SolidStart (SSR), TypeScript, Tailwind CSS v4, Prisma + MariaDB, Firebase Realtime Database

**Routing**: File-based via `src/routes/`. `src/app.tsx` is the root — it splits traffic between public routes (login, forgot/reset password) and protected routes, which are wrapped in `AppLayout` (sidebar + nav). The middleware at `src/middleware/auth.ts` enforces session validity server-side before protected pages render.

**Server functions**: All mutations and data queries live in `src/server/actions/index.ts` using the `"use server"` directive. Client components call these with `createAsync` or `action`. Errors are thrown as `new Response(message, { status })` — not `Error` objects.

**Auth & sessions**: `src/server/session.ts` issues opaque tokens stored as SHA-256 hashes in the DB (7-day TTL). `getUser()` in `src/server/auth.ts` is a cached server function that redirects to `/login` if no valid session exists. Password hashing uses Argon2.

**Role hierarchy**: `SUPERADMIN > ADMIN > USER`. Every server action calls `getSession()` then uses `getScopedRegionIds()` / `getScopedBlockIds()` to restrict data visibility based on the caller's role and region assignments.

**Data model** (`prisma/schema.prisma`):

- `Region → Block → Sprayer` — physical hierarchy
- `SensorReading` / `IrrigationEvent` — time-series data per sprayer
- `AdminRegionAssignment` / `UserRegionAssignment` — role-scoped access control
- `IndicatorThreshold` — per-user moisture thresholds per region
- `ActivityLog` — audit trail for all mutations
- All IDs are cuid strings; DB columns use `snake_case` mapped from camelCase model fields

**Firebase integration**: `src/server/services/firebaseSync.ts` syncs live sensor data from Firebase Realtime Database into MariaDB. The path scheme is `{regionSegment}/blocks/{blockSegment}/{sprayerSegment}`, where names are sanitized via `firebaseSegment()` (strips `.#$/[]`). `refreshFirebaseCache()` is called at the start of dashboard/history/stats actions.

**Path alias**: `~` resolves to `src/`.

## Environment variables

Required in `.env`:

```
DATABASE_URL=             # MariaDB connection string
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_DATABASE_URL=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
```

Optional:

```
APP_ORIGIN=               # Default: http://localhost:3000
SESSION_COOKIE_NAME=      # Default: adosistering_session
SMTP_PORT=                # Default: 587
SMTP_SECURE=              # Default: false
EMAIL_FROM=
FIREBASE_SYNC_DISABLED=true  # Disable Firebase sync in dev
```

## Key conventions

- UI text and error messages are in Indonesian.
- Moisture status labels: `Kering` (dry), `Lembab` (moist), `Basah` (wet) — defined in `src/lib/shared/irrigation.ts` and mirrored in the Prisma enum `MoistureStatus`.
- Server actions return `{ ok: true }` on success; throw `new Response(string, { status })` on failure.
- After any Region/Block/Sprayer mutation, the action attempts to sync to Firebase and updates the `firebaseSyncStatus` field (`SYNCED` | `FAILED` | `PENDING`).

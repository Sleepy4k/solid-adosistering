# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start dev server (Vite)
bun run build        # Production build
bun run start        # Start production server (node server.mjs)
bun run check        # tsc --noEmit + lint + format (run before committing)
bunx tsc --noEmit    # Type-check only — safer than bun run check (see caution below)
bun run lint         # ESLint --fix + Prettier write
bun run db:generate  # Regenerate Prisma client after schema changes
bun run db:migrate   # Run migrations (dev)
bun run db:seed      # Seed the database (bun prisma/seed.ts)
```

> **Caution**: `bun run lint` (ESLint `--fix` + Prettier) has been observed to accidentally empty source files in rare race conditions. Prefer `bunx tsc --noEmit` for type-checking only. Only run the full lint pass when you intend to format.

## Architecture

**Stack**: SolidJS + SolidStart (SSR), TypeScript, Tailwind CSS v4, Prisma + MariaDB, Firebase Realtime Database

**Routing**: File-based via `src/routes/`. `src/app.tsx` is the root — it splits traffic between public routes (login, forgot/reset password, landing page `/`) and protected routes wrapped in `AppLayout` (sidebar + nav). The middleware at `src/middleware/auth.ts` enforces session validity server-side before protected pages render.

**Server functions**: All mutations and data queries live in `src/server/actions/index.ts` using the `"use server"` directive. Client components call these with `createAsync` or `action`. Errors are thrown as `new Response(message, { status })` — not `Error` objects. Use `query` (not the deprecated `cache`) from `@solidjs/router` to wrap server functions for `createAsync`.

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

**Firebase client field aliasing**: `src/lib/client/firebaseClient.ts` `mapSprayerNode()` tries multiple field name variants for hardware compatibility (`totalVolume`, `totalVolume_L`, `total_volume_L`, `total_volume`, `volume_L`, `waterVolume`). `flowLmin` and `totalVolumeLiter` are both divided by `volumeDivider` before being stored.

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
VITE_FIREBASE_API_KEY=        # Client-side Firebase config
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

## Key conventions

- UI text and error messages are in Indonesian.
- Moisture status labels: `Kering` (dry), `Lembab` (moist), `Basah` (wet) — defined in `src/lib/shared/irrigation.ts` and mirrored in the Prisma enum `MoistureStatus`.
- Server actions return `{ ok: true }` on success; throw `new Response(string, { status })` on failure.
- After any Region/Block/Sprayer mutation, the action attempts to sync to Firebase and updates the `firebaseSyncStatus` field (`SYNCED` | `FAILED` | `PENDING`).
- `volumeDivider` (per Region) is applied to `flowLmin` and `totalVolumeLiter` in both server actions (history, statistics) and the Firebase client mapper.

## UI components

**Never use native `<select>` or `<input type="date">`.** Use these custom components instead:

- `SimpleSelect` (`src/components/ui/SimpleSelect.tsx`) — for static options (2–4 choices), no search bar.
- `SelectSearch` (`src/components/ui/SelectSearch.tsx`) — for dynamic/large option lists with search.
- `DatePicker` (`src/components/ui/DatePicker.tsx`) — custom date picker with Today button and year picker. Value format: `"yyyy-mm-dd"`.
- `Toggle` (`src/components/ui/Toggle.tsx`) — for boolean toggles (pump relay, auto mode).
- `useConfirm()` from `ConfirmProvider` — **required** for any destructive or irreversible action (delete, pump toggle, mode toggle, filter reset).

**Modals**: `ModalFrame` (`src/components/shared/ModalFrame.tsx`) wraps all edit/create modals via `Portal`. Its overlay must NOT use `backdrop-blur-sm` — causes GPU compositing lag. Use plain `bg-slate-950/40`.

**Global cursor style**: `button:not(:disabled) { cursor: pointer }` is in `app.css`. Do not add `cursor-pointer` per-component.

**Live date**: Use `useLiveDate()` from `src/lib/client/liveDate.ts` for date displays in page headers (updates at midnight without reload).

## Form validation

All forms use per-field live validation:

- Validators: `validateName`, `validateEmail`, `validatePhone`, `validateMessage`, `validateNewPassword`, `validatePasswordConfirm` — all in `src/lib/shared/validation.ts`.
- Pattern: debounced 300 ms on input, immediate on blur, validate-all on submit.
- Submit button disabled when any field has an error (`hasErrors = createMemo(() => !!(err1() || err2() || ...))`).
- Display errors below each field: `<Show when={xErr()}><span class="mt-0.5 text-xs text-rose-600">{xErr()}</span></Show>`.
- Do not add HTML `required` attributes — custom validation covers it.

## Pagination (irrigation history)

`getIrrigationHistory` returns `{ items, nextCursor }` with cursor-based pagination. The route (`src/routes/irrigation-history.tsx`) uses infinite scroll via `IntersectionObserver` on a sentinel element. Page size is `PAGE_SIZE = 10`, server max is 85. A `fetchSeq` counter prevents stale responses from overwriting newer ones.

## Landing page CMS

Models `landingTestimonial`, `landingLocation`, `landingPartner` don't exist in the Prisma schema. Their getter functions in `src/server/actions/landing-cms.ts` use `(prisma as any).modelName.findMany(...)` wrapped in try-catch returning `[]`, with explicit typed return types to prevent implicit `any` propagation.

## Admin role restrictions

Admin role in settings is read-only: they can VIEW but not edit irrigation control and safety timeout panels. `IrrigationControl` and `SafetyTimeoutPanel` both accept a `readOnly` prop.

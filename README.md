# Adosistering

SolidStart IoT irrigation management system for rice fields. The app uses a primary relational database for users, RBAC, assignments, thresholds, logs, historical readings, and email records, while Firebase RTDB is reserved for live sprayer telemetry and control.

## Stack

- SolidStart, SolidJS, Vinxi runtime, Vite-powered builds
- Bun package manager and Bun server preset through Vinxi
- TailwindCSS v4
- MySQL primary database through Prisma ORM only
- Firebase Admin SDK on the server and Firebase client listeners for dashboard telemetry
- Nodemailer for transactional email
- Solid Meta for per-page SEO
- ESLint and Prettier auto-formatting with 2-space indentation

## Architecture

- `prisma/schema.prisma` contains the normalized relational model for users, RBAC assignments, regions, blocks, sprayers, thresholds, readings, irrigation events, activity logs, alerts, password reset tokens, and email delivery records.
- `src/server/*` is server-only infrastructure: Prisma client, Firebase Admin initialization, Firebase sync functions, RBAC/security helpers, email, and SolidStart server actions.
- `src/lib/firebaseClient.ts` is the only client Firebase integration. It reads `VITE_FIREBASE_*` public values and subscribes to RTDB telemetry paths.
- `src/domain/irrigation.ts` holds shared pure logic for moisture indicator calculation and Firebase-safe path segments.
- `src/config/public.ts` exposes only safe public config to the browser.
- `src/server/config.ts` loads `.env` through `dotenv/config` and keeps secrets server-only.

The UI does not ship mock operational data. If required connection config is missing, pages show `Web belum dikonfigurasi`.

## Firebase Sync Contract

Region, block, and sprayer creation/update server actions write to the primary database and provision the matching RTDB nodes:

```text
REGION_NAME / BLOCK_NAME / SPRAYER_ID / control
REGION_NAME / BLOCK_NAME / SPRAYER_ID / data
REGION_NAME / BLOCK_NAME / SPRAYER_ID / setting
```

Server secrets stay in `.env` only. Browser code only uses `VITE_FIREBASE_*` public client config.

## Setup

```bash
bun install
copy .env.example .env
bunx prisma generate
bun run dev -- --host 127.0.0.1 --port 3000
```

Set `DATABASE_URL`, Firebase Admin variables, SMTP variables, and public `VITE_FIREBASE_*` variables before connecting real services.

Use a MySQL URL:

```env
DATABASE_URL="mysql://root:password@localhost:3306/adosistering"
```

After setting `.env`, run:

```bash
bun run db:migrate
bun run db:seed
```

The default seed creates Superadmin and Admin users from `SEED_*` variables.

## Verification

```bash
bun run lint
bunx tsc --noEmit
bun run build
```

Vinxi's full production build spawns `node` internally. Install Node.js 22+ on the machine even when the deployed server preset is Bun.

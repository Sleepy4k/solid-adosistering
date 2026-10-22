# Adosistering

Adosistering is an IoT smart-irrigation dashboard for monitoring soil moisture, controlling sprayers, and reviewing irrigation history across regions and blocks. This repository is the SolidStart v2 application that consolidates the former `references/` codebase into the root project.

## Documentation

- [docs/normalization.md](./docs/normalization.md) — BCNF model changes, migration order, and post-migration verification.
- [docs/deployment.md](./docs/deployment.md) — production release, migration, and rollback planning.
- [SECURITY.md](./SECURITY.md) — security controls, deployment checklist, and vulnerability reporting.

## Stack

- **SolidStart 2** (`@solidjs/start`), SolidJS, Vite 8, Nitro 3
- **TypeScript 6** with strict type checking
- **Prisma 7** + MariaDB/MySQL (`@prisma/adapter-mariadb`)
- **Tailwind CSS 4**
- **Firebase Realtime Database** for live sensor/block updates
- **Nodemailer** for transactional email
- **Argon2id** password hashing

## Requirements

- Bun 1.3+ (recommended) or Node.js 24+
- MariaDB 10.6+ / MySQL 8+
- A Firebase project if realtime sync is enabled

## Setup

```bash
bun install
cp .env.example .env
# edit .env with your database, origin, SMTP, and Firebase values
bun run db:generate
bun run db:deploy
bun run db:seed
```

The seed script creates demo accounts and core region/block data. It has no default password: set `SEED_PASSWORD` (or `SEED_SUPERADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`) before running it. `SEED_ALLOW_DEMO=true` opts into the built-in demo passwords and is only for local or demo environments. Change all seeded passwords immediately in any shared environment.

### Environment

The full list is documented in `.env.example`. Important values:

| Variable                                                               | Purpose                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                         | MariaDB/MySQL connection string (required at runtime).                          |
| `APP_ORIGIN`                                                           | Public HTTPS origin used for CSRF checks and redirects. Required in production. |
| `VITE_SITE_URL`                                                        | Public site URL baked into canonical/OG/sitemap metadata at build time.         |
| `SESSION_COOKIE_NAME`                                                  | Session cookie base name; production uses the `__Host-` prefix automatically.   |
| `TRUST_PROXY`                                                          | Set `true` only when a trusted reverse proxy overwrites `X-Forwarded-For`.      |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin credentials (server only).                                       |
| `FIREBASE_SERVICE_ACCOUNT_JSON`                                        | Optional single-line service-account JSON; overrides the three fields above.    |
| `FIREBASE_DATABASE_URL`                                                | Realtime Database URL for server-side sync.                                     |
| `FIREBASE_SYNC_DISABLED`                                               | Set `true` to run without Firebase sync.                                        |
| `VITE_FIREBASE_*`                                                      | Restricted public Firebase client configuration.                                |
| `VITE_FIREBASE_APP_CHECK_SITE_KEY`                                     | reCAPTCHA site key used by Firebase App Check.                                  |
| `SMTP_*`, `EMAIL_FROM`, `SMTP_TLS_REJECT_UNAUTHORIZED`                 | Transactional email configuration. Keep TLS verification enabled in production. |
| `NEWSLETTER_TOKEN_SECRET`                                              | Newsletter unsubscribe HMAC secret; 32+ characters outside development.         |
| `NEWSLETTER_CONFIRM_TTL_HOURS`                                         | Confirmation link lifetime in hours, 1-168 (default 24).                        |
| `UPLOAD_DIR`, `UPLOAD_MAX_BYTES`                                       | Private upload directory and maximum file size.                                 |
| `SEED_PASSWORD`                                                        | Required for production seeding unless all role-specific overrides are set.     |

Never prefix a server secret with `VITE_`. The build fails if a variable such as `VITE_DATABASE_URL` or `VITE_FIREBASE_PRIVATE_KEY` is detected, including values loaded from `.env` files.

## Development

```bash
bun run dev        # Vite dev server on http://localhost:3000
bun run typecheck  # tsc --noEmit
bun run lint       # ESLint
bun run format:check
bun run check      # typecheck + lint + format check
```

## Production build

```bash
# VITE_SITE_URL must be the real public URL at build time
VITE_SITE_URL="https://adosistering.example" bun run build
bun run start      # node .output/server/index.mjs
```

`bun run build` (or `npm run build`) generates the Prisma client, builds the app, and then applies pending database migrations through `scripts/migrate-deploy.mjs`, so `DATABASE_URL` must be set for the build. Set `SKIP_DB_MIGRATE=1` to build without a database. See [docs/deployment.md](docs/deployment.md#apply-migrations) for its safeguards.

The server requires `DATABASE_URL`; outside development it also requires `NEWSLETTER_TOKEN_SECRET` (at least 32 characters), and production requires a valid HTTPS `APP_ORIGIN`. `assertServerConfig` runs lazily on the first page or `/_server` request that needs it, including public newsletter pages and every `/_server` call.

Nitro keeps `firebase-admin` external because bundling its CommonJS internals is unsafe. Deploy `.output` together with production `node_modules` (for example `bun install --frozen-lockfile --production` on the target host), or configure your bundler to package that dependency. Do not copy `.env` or `.data` into the public web root.

Schema migrations are forward-only. Read [docs/deployment.md](./docs/deployment.md) before applying them to a production database; the pending migration set requires a backup and a maintenance window.

## Data model

The affected relations are normalized to BCNF so control settings, display preferences, and scope are stored once.

- `Region` owns `dryMaxPercent`, `wetMinPercent`, `automaticMode`, and `safetyTimeoutMin`/`safetyTimeoutMax`. The Firebase `region_settings` node is a downstream mirror written by the app, not a second source of truth.
- **Automatic mode is a region-wide hardware switch.** Enabling `Region.automaticMode` sets every active sprayer to `AUTO/OFF`; disabling sets `MANUAL/OFF`. SQL is authoritative and the Firebase mirror follows it. This application does not run a server-side watering scheduler, so device firmware must act on the per-sprayer AUTO mode; `showAutoIrrigation` only controls display visibility. Toggles serialize in process memory (`withAutomaticModeLock`), so keep the deployment at one replica until a distributed lock exists.
- `IndicatorThreshold` keeps only per-user display fields (`displayDryMaxPercent`, `displayMoistMaxPercent`, `displayWetMinPercent`) plus `landPreference`.
- `SensorReading`, `IrrigationEvent`, and `ActivityLog` no longer store `blockId`. Block scope is derived through `Sprayer -> Block`, and `SensorReading` is keyed by `(sprayerId, sourceKey)` so repeated same-second payloads are not discarded.
- `NewsletterSubscriber` uses a `PENDING | CONFIRMED | UNSUBSCRIBED` lifecycle. A public signup creates a pending row for a new address, or rotates one for a pending/previously unsubscribed address; an already-confirmed address returns early without rotating its token. Only a button click on `/newsletter/confirm?token=...` confirms it. Migration `20261021140000_newsletter_double_opt_in_and_drop_api_key` backfills legacy subscribers (active to `CONFIRMED` with `consent_source='LEGACY_IMPORT'`, inactive to `UNSUBSCRIBED`) and removes the old `is_active` flag.
- `UserProfile.apiKey` and the underlying `user_detail.api_key` column were removed, including its unique index. No server action or API route authenticates with an API key.
- `AlertNotificationTarget` stores at most one normalized target (`REGION`, `BLOCK`, or `SPRAYER`) per alert instead of three nullable scope columns.
- User deletion is a soft delete plus anonymization. Activity, irrigation, email, and alert rows keep their historical references instead of being orphaned or destroyed.

See [docs/normalization.md](./docs/normalization.md) for the functional dependencies removed, the expand/backfill/contract sequence, and verification SQL.

## Security model

- **Passwords:** Argon2id with per-password salts and transparent rehashing when parameters change.
- **Sessions:** opaque tokens stored as SHA-256 hashes, `HttpOnly` + `Secure` + `SameSite=Lax` cookies, idle and absolute expiry, rotation on login.
- **Login protection:** per-email attempts use a persistent atomic reservation in `login_throttle` (a MariaDB row lock via `INSERT IGNORE` plus `SELECT ... FOR UPDATE`), so replicas share one failure counter and cooldown ladder. A separate in-memory per-IP brake allows 100 attempts per 15 minutes and never escalates; client IPs that resolve to `"unknown"` are not used as a blocking key. A successful login clears only the per-email reservation, and blocked attempts do not extend an active cooldown.
- **Reset tokens:** single-use, hashed, expire quickly, and invalidate existing sessions after a successful reset.
- **Server actions:** Zod input validation, role checks, rate limits, generic error responses, and audit logging.
- **CSRF:** same-origin `Origin`/`Referer` validation for unsafe methods. `/_server` accepts only POST or the SolidStart `X-Server-Instance` header-marked GET transport; headerless GET and every other method return `405`, and any present `Origin`/`Referer` must match the exact configured origin.
- **CSP:** per-request nonce in production; scripts receive the nonce through middleware and SSR. CSP is relaxed only for Vite development.
- **Headers:** HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy, COOP/CORP, and no `X-Powered-By`.
- **Uploads:** private `.data/uploads` directory; only 32-hex PNG/JPEG filenames are served, with signature checks, size limits, `nosniff`, and immutable caching.
- **Firebase:** Admin SDK runs server-side only. Client configuration is restricted to public identifiers and App Check is initialized when a site key is configured. Deploy `firebase.rules.json` and enable App Check enforcement for Realtime Database in the Firebase Console.

See [SECURITY.md](./SECURITY.md) for the deployment checklist and reporting process.

## SEO

- Dynamic `/sitemap.xml` with canonical landing URL and last-modified data
- `/robots.txt`, `/llms.txt`, and `/llms-full.txt`
- Canonical, hreflang, Open Graph, Twitter, theme-color, icons, web manifest, and JSON-LD
- Only the landing page is indexable; dashboard/auth pages are `noindex`
- Newsletter confirmation and unsubscribe token pages are `noindex` and disallowed in `/robots.txt`
- Security contact metadata at `/.well-known/security.txt`

## Uploads and fonts

CMS uploads are written to `.data/uploads/cms` (gitignored) and served from `/uploads/cms/<filename>`. The directory must be writable by the runtime user and must not be placed under `public/`.

Fonts are self-hosted under `public/fonts`; no request is made to Google Fonts at runtime. Landing imagery uses WebP assets under `public/landing`.

## Project layout

```text
src/
  components/        shared UI, map, SEO, error boundary
  config/            public/client configuration
  constants/         shared constants
  features/          landing/dashboard feature components
  layouts/           landing and app shells
  lib/               client Firebase and shared utilities
  middleware/        security headers, CSP, CSRF, route guards
  routes/            pages, API routes, sitemap/robots/llms
  server/
    actions/         server functions grouped by feature
    auth/            Argon2id, sessions, login throttling
    db/              Prisma client
    domain/          access control, audit, thresholds, Firebase cache
    http/            rate limiting and server-function error handling
    integrations/
      firebase/      Admin SDK, Realtime Database sync
      email/         Nodemailer transport and delivery
    validation/      Zod schemas for every trust boundary
    config.ts        environment parsing and fail-closed validation
  templates/         transactional email templates
prisma/
  schema.prisma      data model
  migrations/        ordered SQL migrations
  seed.ts            repeatable, non-destructive demo seed data
docs/                normalization and deployment guides
public/              static assets, icons, fonts, SEO files
```

Server code is layered so server functions stay thin: `actions` orchestrate `domain`, `db`, `auth`, `http`, and `integrations`; `validation` owns the Zod schemas; and `config.ts` fails closed when required environment values are missing.

The legacy `references/` directory is intentionally not part of the build and is ignored by formatting, linting, and Git. It remains only as migration reference material.

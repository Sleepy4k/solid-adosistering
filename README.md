# Adosistering

Adosistering is an IoT smart-irrigation dashboard for monitoring soil moisture, controlling sprayers, and reviewing irrigation history across regions and blocks. This repository is the SolidStart v2 application that consolidates the former `references/` codebase into the root project.

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

The seed script creates demo accounts and core region/block data. It refuses to run with the built-in demo passwords when `NODE_ENV=production`; set `SEED_PASSWORD` (or `SEED_SUPERADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`) first. Change all seeded passwords immediately in any shared environment.

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

The server requires `DATABASE_URL` and, in production, a valid HTTPS `APP_ORIGIN`. Configuration is validated on the first non-static request.

Nitro keeps `firebase-admin` external because bundling its CommonJS internals is unsafe. Deploy `.output` together with production `node_modules` (for example `bun install --production` on the target host), or configure your bundler to package that dependency. Do not copy `.env` or `.data` into the public web root.

## Security model

- **Passwords:** Argon2id with per-password salts and transparent rehashing when parameters change.
- **Sessions:** opaque tokens stored as SHA-256 hashes, `HttpOnly` + `Secure` + `SameSite=Lax` cookies, idle and absolute expiry, rotation on login.
- **Login protection:** per-IP and per-email throttling backed by a Prisma table with an in-memory fallback; successful login clears the counters.
- **Reset tokens:** single-use, hashed, expire quickly, and invalidate existing sessions after a successful reset.
- **Server actions:** Zod input validation, role checks, rate limits, generic error responses, and audit logging.
- **CSRF:** same-origin `Origin`/`Referer` validation for unsafe methods, plus custom `X-Server-Id` headers used by SolidStart server functions.
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
- Security contact metadata at `/.well-known/security.txt`

## Uploads and fonts

CMS uploads are written to `.data/uploads/cms` (gitignored) and served from `/uploads/cms/<filename>`. The directory must be writable by the runtime user and must not be placed under `public/`.

Fonts are self-hosted under `public/fonts`; no request is made to Google Fonts at runtime. Landing imagery uses WebP assets under `public/landing`.

## Project layout

```text
src/
  components/        shared UI, map, SEO, error boundary
  features/          landing/dashboard feature components
  layouts/           landing and app shells
  middleware/        security headers, CSP, CSRF, route guards
  routes/            pages, API routes, sitemap/robots/llms
  server/            actions, auth, session, validation, services
  templates/         transactional email templates
prisma/
  schema.prisma      data model
  migrations/        ordered SQL migrations
  seed.ts            demo seed data
public/              static assets, icons, fonts, SEO files
```

The legacy `references/` directory is intentionally not part of the build and is ignored by formatting, linting, and Git. It remains only as migration reference material.

# Security Policy

## Supported versions

Only the current `main` branch of this application is supported. Deployments should run the latest commit and keep dependencies patched.

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Email: **adosisteringteam@gmail.com**
- Include: affected route/component, reproduction steps, impact, and any suggested fix.
- Do not include production credentials, personal data, or exploit details in public channels.

We aim to acknowledge reports within 5 business days and will coordinate disclosure after a fix is available.

## Security controls in this application

### Authentication and sessions

- Argon2id password hashing (`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1)
- Rehash-on-login when parameters change
- Opaque session tokens stored only as SHA-256 hashes in the database
- `HttpOnly`, `Secure`, `SameSite=Lax` cookies; `__Host-` prefix in production
- Idle timeout and absolute session lifetime; expired sessions are deleted
- Session rotation on login and invalidation on password change/reset
- Per-email login throttling persists in `LoginThrottle` and uses an atomic reservation (`INSERT IGNORE` plus `SELECT ... FOR UPDATE`) so concurrent attempts and multiple app instances share one counter and cooldown ladder
- The reservation happens before password verification, so every attempt consumes a slot; a successful login clears only the per-email key
- An active cooldown is never extended by further attempts, and the cooldown ladder resets after an idle window
- A separate coarse per-IP brake is held in process memory at 100 attempts per 15 minutes and is deliberately non-escalating; IPs that resolve to `"unknown"` are never used as a blocking key
- Dummy password verification for unknown accounts to reduce timing leakage

### Server actions and API routes

- Zod validation at every trust boundary
- Role checks in the action layer and middleware route guards
- Per-action and per-IP rate limits for sensitive operations
- Single-use, hashed password-reset tokens
- Generic client-facing errors; details stay in server logs
- Audit logging for authentication and administrative changes
- Upload validation: extension, MIME type, magic-byte signature, size, and restrictive filename pattern

### Browser hardening

- Production CSP uses a per-request nonce and `strict-dynamic`
- `X-Frame-Options: DENY`, `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- HSTS, COOP, CORP, permissions policy
- Same-origin CSRF checks for unsafe methods
- Upload responses use `nosniff`, `Content-Disposition: inline`, and a restrictive CSP

### Firebase

- Admin credentials are server-only and never exposed through `VITE_*`
- Client configuration contains only public Firebase identifiers
- App Check is initialized on the client when `VITE_FIREBASE_APP_CHECK_SITE_KEY` is set
- Realtime Database rules are deny-by-default for writes
- Public reads of the `region_settings`, `blocks`, and sprayer subtrees (including control state, telemetry, and history) are allowed by `firebase.rules.json`. Treat those nodes as public and never place personal, credential, or operational secret data in the Realtime Database; this remains a documented deployment risk.
- App Check enforcement for Realtime Database must still be enabled in the Firebase Console. Client initialization alone does not enforce it, and the deny-by-default write rules remain the primary write control.

## Dependency advisories

`seroval` is held at `1.6.11` by the `overrides` block in `package.json`; the lockfile resolves `1.6.11`, and `seroval-plugins` is held on the same line. Remaining `bun audit` findings are transitive or build-time dependencies, or affect code paths that are not reachable from the server runtime. They are tracked separately and are not claimed to be zero advisories. Re-run `bun audit` after dependency changes and review reachability before upgrading.

## Deployment checklist

1. Serve the app over HTTPS only and set `APP_ORIGIN` to the exact public origin.
2. Set a strong `DATABASE_URL`; use a least-privilege database user.
3. Keep `TRUST_PROXY=false` unless a trusted proxy overwrites `X-Forwarded-For`.
4. Configure SMTP with a valid certificate. Do not disable TLS verification for convenience.
5. Build with the real `VITE_SITE_URL`.
6. Store Firebase service-account JSON in a secret manager, not in git.
7. Deploy `firebase.rules.json` and enable **App Check enforcement** for Realtime Database in the Firebase Console. The Admin SDK bypasses database rules, so App Check and server-side authorization are both required.
8. Make `UPLOAD_DIR` writable by the runtime user and outside `public/`.
9. Back up the database, confirm strict `sql_mode`, and read [docs/deployment.md](./docs/deployment.md) before running `bun run db:deploy`. The BCNF migration is irreversible and needs a maintenance window.
10. Rotate seeded/demo credentials and remove unused accounts.
11. Review `/.well-known/security.txt` contact and expiry values on each release.

## Known operational notes

- Database migrations are ordered SQL files under `prisma/migrations`; apply them with `bun run db:deploy`. Never use `db:migrate` in production.
- If the application starts without a database, configuration validation fails closed on the first non-static request.
- The `LoginThrottle` table should be purged periodically; expired entries are ignored at read time and stale rows are pruned in the background.
- The per-IP login brake is per process. Multiple replicas each get their own allowance, so it is a coarse abuse brake rather than a cluster-wide quota; the per-email reservation remains the cross-replica control.
- Do not commit `.env`, `.data`, `references/`, or generated `.output` artifacts.

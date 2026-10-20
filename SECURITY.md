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
- No API-key authentication surface exists; the legacy `user_detail.api_key` column was removed
- Upload validation: extension, MIME type, magic-byte signature, size, and restrictive filename pattern

### Newsletter subscriptions

- `NEWSLETTER_TOKEN_SECRET` is required outside `NODE_ENV=development` and must be at least 32 characters. Development uses a clearly labelled insecure fallback; never use it for a shared environment.
- Confirmation tokens are 32 random bytes; only their SHA-256 hashes are stored. Links expire after `NEWSLETTER_CONFIRM_TTL_HOURS` (1-168, default 24).
- Confirmation uses an atomic state transition. Unknown or already-consumed tokens return `400`; expired tokens return `410`.
- Unsubscribe links use a signed stateless token, `<subscriberId>.<base64url HMAC-SHA256>` over `newsletter-unsubscribe:<id>:<email>`, verified in constant time. They intentionally do not expire, matching standard unsubscribe semantics.
- Token pages never mutate state on GET. The user must press a button, so email link scanners cannot confirm or unsubscribe anyone.
- `/newsletter/confirm` and `/newsletter/unsubscribe` are served with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow, noarchive`; `robots.txt` also disallows `/newsletter`.
- Public subscribe is limited to 10 requests per hour per IP; confirm and unsubscribe are limited to 20 per hour per IP.
- Confirmation email delivery is detached from the subscribe response. The database row is the source of truth; delivery failures are logged, and an admin can resend after the 60-second atomic cooldown. A failed resend restores the previous confirmation link and returns `502`.

### Browser hardening

- Production CSP uses a per-request nonce and `strict-dynamic`
- `X-Frame-Options: DENY`, `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- HSTS, COOP, CORP, permissions policy
- Same-origin CSRF checks for unsafe methods
- `/_server` accepts only POST or the SolidStart `X-Server-Instance` header-marked GET transport; headerless GET and other methods return `405`. Any present `Origin`/`Referer` must match the configured origin, `Sec-Fetch-Site: cross-site` is rejected, and rejections carry `X-Error: true` with `Cache-Control: no-store`.
- Route-policy checks normalize path case and trailing slashes, so a `/Newsletter/Confirm/` variant cannot bypass token-page headers or route guards; actual routing still uses the original path.
- Upload responses use `nosniff`, `Content-Disposition: inline`, and a restrictive CSP

### Firebase

- Admin credentials are server-only and never exposed through `VITE_*`
- Client configuration contains only public Firebase identifiers
- App Check is initialized on the client when `VITE_FIREBASE_APP_CHECK_SITE_KEY` is set
- Realtime Database rules are deny-by-default for writes
- Public reads of the `region_settings`, `blocks`, and sprayer subtrees (including control state, telemetry, and history) are allowed by `firebase.rules.json`. Treat those nodes as public and never place personal, credential, or operational secret data in the Realtime Database; this remains a documented deployment risk.
- App Check enforcement for Realtime Database must still be enabled in the Firebase Console. Client initialization alone does not enforce it, and the deny-by-default write rules remain the primary write control.

## Dependency advisories

`bun audit` currently reports one advisory: `braces@3.0.3` (high, GHSA-vfj7-8cjw-p6xm), reached through `@solidjs/start > micromatch > braces`. No patched `braces` release exists at the time of this release. It is used only by the build-time filesystem-route scanner over developer-authored route globs and is not reachable from runtime request paths, so it is accepted as a build-time residual and kept on the patch watchlist.

The `overrides` block keeps `seroval` and `seroval-plugins` on the `1.6.11` line and also covers `postcss`, `nanoid`, `@grpc/grpc-js`, `source-map-js`, `baseline-browser-mapping`, `browserslist`, `uuid`, and `picomatch`; `nodemailer` resolves to `10.1.7`. This is not a claim of zero advisories. Re-run `bun audit` after dependency changes and review reachability before upgrading.

## Deployment checklist

1. Serve the app over HTTPS only and set `APP_ORIGIN` to the exact public origin.
2. Set `NEWSLETTER_TOKEN_SECRET` to at least 32 characters (for example, `openssl rand -base64 48`) and keep `NEWSLETTER_CONFIRM_TTL_HOURS` within 1-168 (default 24). Outside `NODE_ENV=development`, a missing secret fails closed.
3. Set a strong `DATABASE_URL`; use a least-privilege database user.
4. Keep `TRUST_PROXY=false` unless a trusted proxy overwrites `X-Forwarded-For`.
5. Configure SMTP with a valid certificate. Do not disable TLS verification for convenience.
6. Build with the real `VITE_SITE_URL`.
7. Store Firebase service-account JSON in a secret manager, not in git.
8. Deploy `firebase.rules.json` and enable **App Check enforcement** for Realtime Database in the Firebase Console. The Admin SDK bypasses database rules, so App Check and server-side authorization are both required.
9. Make `UPLOAD_DIR` writable by the runtime user and outside `public/`.
10. Back up the database, confirm strict `sql_mode`, and read [docs/deployment.md](./docs/deployment.md) before running `bun run db:deploy`. The pending migration set is irreversible and needs a maintenance window.
11. Rotate seeded/demo credentials and remove unused accounts.
12. Review `/.well-known/security.txt` contact and expiry values on each release.

## Known operational notes

- Database migrations are ordered SQL files under `prisma/migrations`; apply them with `bun run db:deploy`. Never use `db:migrate` in production.
- Automatic-mode toggles are serialized per region in process memory. Keep the deployment at a single application replica until a distributed lock exists; a second process can interleave a toggle with its compensation.
- Newsletter confirmation email is sent after the database commit and is not retried automatically. The subscriber row is the source of truth; an admin can resend once the 60-second cooldown has elapsed. Bulk sending has no cross-request idempotency, so retrying an interrupted campaign can duplicate mail to recipients who were already delivered.
- The header-marked `/_server` GET transport is defense-in-depth. A DNS-rebinding attacker can invoke only unauthenticated public GET actions because the `__Host-` session cookie is not sent to the attacker hostname; authenticated mutations remain blocked by exact-origin POST checks. Terminate TLS at a proxy that preserves and validates the public `Host` and rejects unknown hostnames.
- The application is intended to be served at `/`. Sub-path mounting is unsupported because the middleware `/_server` guard matches the root path.
- Public rate-limit buckets are in-process and capped at 20,000 entries; extreme source-IP cardinality can evict older buckets. Use proxy-level limiting for internet-facing deployments.
- If the application starts without a database, configuration validation fails closed on the first page or `/_server` request that needs it.
- The `LoginThrottle` table should be purged periodically; expired entries are ignored at read time and stale rows are pruned in the background.
- The per-IP login brake is per process. Multiple replicas each get their own allowance, so it is a coarse abuse brake rather than a cluster-wide quota; the per-email reservation remains the cross-replica control.
- Do not commit `.env`, `.data`, `references/`, or generated `.output` artifacts.

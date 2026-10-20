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
- Per-IP and per-email login throttling persisted in `LoginThrottle` with an in-memory fallback
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

## Deployment checklist

1. Serve the app over HTTPS only and set `APP_ORIGIN` to the exact public origin.
2. Set a strong `DATABASE_URL`; use a least-privilege database user.
3. Keep `TRUST_PROXY=false` unless a trusted proxy overwrites `X-Forwarded-For`.
4. Configure SMTP with a valid certificate. Do not disable TLS verification for convenience.
5. Build with the real `VITE_SITE_URL`.
6. Store Firebase service-account JSON in a secret manager, not in git.
7. Deploy `firebase.rules.json` and enable **App Check enforcement** for Realtime Database in the Firebase Console. The Admin SDK bypasses database rules, so App Check and server-side authorization are both required.
8. Make `UPLOAD_DIR` writable by the runtime user and outside `public/`.
9. Run `bun run db:deploy` before starting a new release.
10. Rotate seeded/demo credentials and remove unused accounts.
11. Review `/.well-known/security.txt` contact and expiry values on each release.

## Known operational notes

- Database migrations are ordered SQL files under `prisma/migrations`; apply them with `bun run db:deploy`.
- If the application starts without a database, configuration validation fails closed on the first non-static request.
- The `LoginThrottle` table should be purged periodically; expired entries are ignored at read time.
- Do not commit `.env`, `.data`, `references/`, or generated `.output` artifacts.

# Production Deployment

This runbook covers a production release of the SolidStart application, including the ordered migration set: security hardening and indexes, BCNF normalization, redundant-index cleanup, and newsletter double opt-in plus API-key removal. It assumes MariaDB 10.6+ or MySQL 8+, Bun 1.3+, and a reverse proxy that terminates TLS.

The pending migrations are forward-only and change table structure. Do not treat them as a routine zero-downtime deploy.

## Pre-deploy checklist

### 1. Back up the database

Take a full logical backup and test that it restores. Keep the backup until the new release has passed post-deploy verification.

```bash
mysqldump \
  --defaults-extra-file=/path/to/client.cnf \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  "${DB_NAME}" > "adosistering-$(date -u +%Y%m%dT%H%M%SZ).sql"
```

Store database credentials in the defaults file or a secret manager, not in shell history. `--single-transaction` gives a consistent InnoDB snapshot, but quiescing writes first is safer when the release window allows it.

Record the restore command and verify it on a staging copy before the production window. Keep the previous release artifact and its environment available until the new release passes verification; restoring the backup and redeploying that artifact is the rollback path.

### 2. Confirm strict SQL mode

```sql
SELECT @@GLOBAL.sql_mode, @@SESSION.sql_mode;
```

`STRICT_TRANS_TABLES` or `STRICT_ALL_TABLES` should be enabled. Do not disable strict mode to force the migration through. The BCNF migration resizes string columns to match the validators, and some targets are narrower than the legacy `VARCHAR(191)` columns. A value that exceeds a new width will fail under strict mode; find and fix it first.

```sql
SELECT MAX(CHAR_LENGTH(email)) AS max_email FROM `user`;
SELECT MAX(CHAR_LENGTH(name)) AS max_name FROM `user`;
SELECT MAX(CHAR_LENGTH(name)) AS max_region_name FROM `region`;
SELECT MAX(CHAR_LENGTH(entity_type)) AS max_entity_type FROM `activity_log`;
SELECT MAX(CHAR_LENGTH(entity_id)) AS max_entity_id FROM `activity_log`;
SELECT MAX(CHAR_LENGTH(token_hash)) AS max_token_hash FROM `session`;
```

Compare the results with the target widths in `prisma/schema.prisma`. A mismatch is a data-cleanup task before the release, not a reason to relax `sql_mode`.

### 3. Set lock wait behavior

DDL waits for metadata locks. Set a bounded wait before the window so a long-running query fails the migration predictably instead of blocking it indefinitely.

```sql
SHOW VARIABLES LIKE 'lock_wait_timeout';
SET GLOBAL lock_wait_timeout = 120;
```

This requires the appropriate administrative privilege and applies to new sessions. Confirm the value from the session that will run `prisma migrate deploy`, and make sure no long transactions or open metadata locks are holding the affected tables.

### 4. Capture row counts

Save the output in the release ticket. These counts are the baseline for the post-deploy comparison.

```sql
SELECT 'sensor_reading' AS table_name, COUNT(*) AS row_count FROM sensor_reading
UNION ALL
SELECT 'irrigation_event', COUNT(*) FROM irrigation_event
UNION ALL
SELECT 'activity_log', COUNT(*) FROM activity_log
UNION ALL
SELECT 'session', COUNT(*) FROM session
UNION ALL
SELECT 'user', COUNT(*) FROM `user`
UNION ALL
SELECT 'region', COUNT(*) FROM region
UNION ALL
SELECT 'indicator_threshold', COUNT(*) FROM indicator_threshold;
```

Also capture the legacy region settings before they are deleted:

```sql
SELECT `key`, `value`
FROM system_setting
WHERE LEFT(`key`, 16) = 'region_settings:'
   OR `key` LIKE 'safetyTimeout:%'
   OR `key` = 'safetyTimeout';

SELECT COUNT(*) AS legacy_scoped_alerts
FROM alert_notification
WHERE region_id IS NOT NULL
   OR block_id IS NOT NULL
   OR sprayer_id IS NOT NULL;
```

### 5. Schedule a maintenance window

There is no built-in maintenance mode. Put the reverse proxy or load balancer into maintenance mode, or stop the old release, so no user writes occur during the migration. The expand phase is not safe for concurrent writes from the old release because that release does not populate `sensor_reading.source_key`.

Plan the window around the row counts above. The migration set drops columns, changes indexes, and may rebuild `sensor_reading`, `irrigation_event`, and `activity_log`. Time scales with table size, not with the number of application requests.

Run `prisma migrate deploy` from exactly one release job. Do not start multiple application instances against the database while the migration is running.

### 6. Prepare the production environment

At minimum, set:

- `DATABASE_URL` — a `mysql://` or `mariadb://` URL for the production database, using a least-privilege user.
- `APP_ORIGIN` — the exact public HTTPS origin, with no path or trailing slash. CSRF checks and redirects depend on it.
- `VITE_SITE_URL` — the public site URL used for canonical URLs, Open Graph metadata, and sitemap output. It is baked in at build time.
- `NODE_ENV=production`.
- `TRUST_PROXY=true` only when a trusted reverse proxy overwrites `X-Forwarded-For`.
- Firebase Admin credentials, or `FIREBASE_SYNC_DISABLED=true` when realtime sync is intentionally off.
- SMTP settings with `SMTP_TLS_REJECT_UNAUTHORIZED=true`.
- `NEWSLETTER_TOKEN_SECRET` — at least 32 characters. Generate it with `openssl rand -base64 48`; outside `NODE_ENV=development`, the server starts but the first request that needs configuration fails closed without it.
- `NEWSLETTER_CONFIRM_TTL_HOURS` — confirmation link lifetime from 1 to 168 hours. The default is `24`.
- `UPLOAD_DIR` pointing to a writable persistent directory outside `public/`.

Set `NEWSLETTER_TOKEN_SECRET` and the HTTPS `APP_ORIGIN` before the server starts. `assertServerConfig` runs on the first page or `/_server` request that needs it, including public newsletter pages and every `/_server` call; a missing secret or a public plain-HTTP origin fails closed.

Production `APP_ORIGIN` must use HTTPS. The only plain-HTTP exception is an exact loopback hostname (`localhost`, `127.0.0.1`, or `[::1]`) for local production preview or smoke tests. A public HTTP origin fails closed.

Run MariaDB/MySQL and the application in UTC. Prisma reads and writes timestamps as UTC, so a mismatched database session time zone shifts confirmation expiry and subscriber timestamps. Raw SQL test fixtures should use `UTC_TIMESTAMP()` rather than `NOW()`.

Keep secrets in a secret manager or an environment file that is not copied into the release artifact. Never put a server secret behind a `VITE_` prefix; the build rejects known secret names.

## Deploy sequence

Run the release from the same commit that produced the artifacts.

```bash
bun install --frozen-lockfile
bun run db:generate
bun run db:deploy
# Do not run bun run db:seed automatically.
VITE_SITE_URL="https://app.example" bun run build
bun run start
```

### Install

`bun install --frozen-lockfile` must be used so the lockfile is not rewritten during a release. Build hosts need devDependencies for Vite, TypeScript, and the Prisma CLI.

If the build and runtime are separate stages, install all dependencies and run the build in the build stage. Run `db:deploy` from a release job that has the Prisma CLI and database access, then create the runtime stage with production dependencies:

```bash
bun install --frozen-lockfile --production
```

After that install, confirm `node_modules/.prisma/client` and `node_modules/firebase-admin` are present before starting. If the production install pruned the generated client, copy the generated `node_modules/.prisma` tree from the build stage or rerun the full frozen install there. Build on the same OS and architecture as the runtime, or install production dependencies on the target host; native modules such as `argon2` are platform-specific.

### Generate the Prisma client

Prisma 7 does not generate the client automatically during `migrate` or `db push`. Run `bun run db:generate` before the build. If the release artifact already contains a generated client for the same schema, this is a no-op.

### Apply migrations

```bash
bun run db:deploy
```

This runs `prisma migrate deploy` and applies every pending migration in filename order. Never use `bun run db:migrate` in production; it is the development command and requires a shadow database.

A production database can have up to four pending migrations if earlier waves were not deployed:

1. `20261020120000_security_hardening_and_indexes` adds session expiry metadata, `login_throttle`, and the pre-normalization indexes. It also removes older duplicate `sensor_reading` rows sharing a `(sprayer_id, recorded_at)` pair before creating the index that the BCNF migration replaces.
2. `20261021120000_bcnf_normalization` performs the region, threshold, sensor, event, audit, alert, user, and string-width changes described in [normalization.md](./normalization.md).
3. `20261021130000_drop_redundant_event_indexes` drops the two redundant `irrigation_event` indexes.
4. `20261021140000_newsletter_double_opt_in_and_drop_api_key` adds the newsletter lifecycle columns, backfills legacy active subscribers to `CONFIRMED` with `consent_source='LEGACY_IMPORT'`, drops the legacy `is_active` flag, and drops `user_detail.api_key` with its unique index.

Apply the pending migrations from this set in filename order from the single release job. Do not start application instances until every pending migration is recorded in `_prisma_migrations`.

If a migration fails, stop the release. MySQL/MariaDB DDL commits implicitly, so the schema can be partially transformed. Follow the rollback guidance in [normalization.md](./normalization.md#irreversibility-and-rollback) instead of rerunning the migration.

Do not run the seed automatically. Production data is not created by a deploy.

### Build

```bash
VITE_SITE_URL="https://app.example" bun run build
```

`VITE_SITE_URL` is embedded at build time. Changing the public URL later requires a rebuild; setting it only at runtime is not enough. The build also validates that no server secret is exposed through a `VITE_*` variable.

### Start

```bash
bun run start
```

This runs `node .output/server/index.mjs`. The process needs the runtime environment described above and a writable `UPLOAD_DIR`.

### Keep `firebase-admin` external

Nitro is configured to externalize `firebase-admin`, `firebase-admin/app`, and `firebase-admin/database` because bundling the CommonJS package internals breaks its initialization. Do not remove that configuration or try to bundle the SDK.

As a result, the runtime needs production `node_modules` next to `.output`. Deploying only `.output` produces an application that fails when it imports the Admin SDK. Keep the dependency tree intact and let Node resolve `firebase-admin` at runtime.

### Runtime files

- `.output` contains the server and client build.
- `node_modules` must contain production dependencies, including `firebase-admin` and native modules.
- `UPLOAD_DIR` and `.data` must be writable and must persist across releases.
- `.env` and `.data` must not be placed under `public/` or served directly by the reverse proxy.
- `firebase.rules.json` is deployed separately to Firebase; it is not read by the app at runtime.

## Post-deploy verification

### Migration state

```bash
bunx prisma migrate status
bunx prisma migrate diff \
  --from-config-datasource \
  --to-schema=prisma/schema.prisma \
  --exit-code
```

`migrate status` must report the database as up to date. `migrate diff` exits with `0` when there is no schema drift and `2` when differences remain. A non-zero result blocks the release.

### HTTP smoke checks

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://app.example/login
curl -sSI https://app.example/dashboard | grep -i '^location:'
curl -sS -o /dev/null -w '%{http_code}\n' https://app.example/sitemap.xml
curl -sS -o /dev/null -w '%{http_code}\n' https://app.example/robots.txt
curl -sS -o /dev/null -w '%{http_code}\n' https://app.example/newsletter/confirm
curl -sS -o /dev/null -w '%{http_code}\n' https://app.example/newsletter/unsubscribe
curl -sS -o /dev/null -w '%{http_code}\n' https://app.example/_server
curl -sSI https://app.example/newsletter/confirm | grep -Ei '^(cache-control|referrer-policy|x-robots-tag):'
```

Expected results:

- `/login` returns `200`.
- An unauthenticated `/dashboard` request redirects to `/login` (the exact `302`/`303` status depends on the router).
- `/sitemap.xml` and `/robots.txt` return `200` and contain the production hostname.
- `/newsletter/confirm` and `/newsletter/unsubscribe` return `200` without a token and render the invalid-link state. Their headers must include `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow, noarchive`.
- `/robots.txt` contains `Disallow: /newsletter`.
- A headerless `GET /_server` returns `405` with `X-Error: true` and `Cache-Control: no-store`. Any other status means the server-function policy is not active.

Then perform a real login in a browser. In production the session cookie uses the `__Host-` prefix and must be `HttpOnly`, `Secure`, and `SameSite=Lax`.

### Region and threshold reads

Open the settings page for a region and confirm that the control values and per-user display values are present. Cross-check the database:

```sql
SELECT id, name, dry_max_percent, wet_min_percent, automatic_mode,
       safety_timeout_min, safety_timeout_max
FROM region
ORDER BY name;

SELECT user_id, region_id, display_dry_max_percent,
       display_moist_max_percent, display_wet_min_percent, land_preference
FROM indicator_threshold
ORDER BY region_id
LIMIT 10;
```

The `region` values must match the pre-deploy legacy settings. `indicator_threshold` must not contain the removed `dry_max_percent` or `wet_min_percent` columns; verify that with the column checks in [normalization.md](./normalization.md#threshold-columns).

### Data and index checks

Compare the post-deploy counts with the baseline:

```sql
SELECT 'sensor_reading' AS table_name, COUNT(*) AS row_count FROM sensor_reading
UNION ALL
SELECT 'irrigation_event', COUNT(*) FROM irrigation_event
UNION ALL
SELECT 'activity_log', COUNT(*) FROM activity_log
UNION ALL
SELECT 'session', COUNT(*) FROM session
UNION ALL
SELECT 'user', COUNT(*) FROM `user`
UNION ALL
SELECT 'region', COUNT(*) FROM region
UNION ALL
SELECT 'indicator_threshold', COUNT(*) FROM indicator_threshold;
```

`sensor_reading`, `irrigation_event`, `activity_log`, `user`, `region`, and `indicator_threshold` must match the baseline. `session` can differ because sessions expire or are rotated.

If `20261020120000_security_hardening_and_indexes` was still pending when you captured the baseline, expect one exception: that earlier migration removes older duplicate `sensor_reading` rows sharing the same `(sprayer_id, recorded_at)` before adding its unique index. Account for that expected reduction separately; the BCNF migration itself does not delete readings.

Run the duplicate and index checks from [normalization.md](./normalization.md#post-migration-verification). In particular, confirm there are no duplicate `(sprayer_id, source_key)` pairs and no `block_id` columns remain on `sensor_reading`, `irrigation_event`, or `activity_log`.

Confirm the newsletter/API-key migration also landed:

```sql
SHOW COLUMNS FROM newsletter_subscriber LIKE 'is_active';
SHOW COLUMNS FROM user_detail LIKE 'api_key';

SELECT status, consent_source, COUNT(*) AS row_count
FROM newsletter_subscriber
GROUP BY status, consent_source;
```

Both `SHOW COLUMNS` statements must return an empty set. Legacy rows imported by the migration show `consent_source = 'LEGACY_IMPORT'`, with previously active subscribers as `CONFIRMED` and inactive subscribers as `UNSUBSCRIBED`.

### Logs

Check the application log for:

- Configuration failures from `assertServerConfig`.
- `[firebase]` sync errors or repeated `FAILED` sync statuses.
- `[email]` delivery failures.
- `[newsletter]` confirmation delivery failures or resend token restore failures. A pending subscriber without a delivered email is recoverable with the admin resend action.
- Any migration or Prisma connection errors.

A Firebase or SMTP warning does not fail the release, but it must be understood before closing the window.

### Firebase mirror

Save a region setting in the admin UI and confirm the change appears in the Realtime Database `region_settings` node. Then confirm App Check enforcement is enabled for Realtime Database in the Firebase Console.

### Newsletter operations

Open the superadmin newsletter page and verify the subscriber list loads. It is server-paginated (`{ items, total, counts }`; default 25 per page, minimum 10, maximum 100, page index capped at 100,000). Resend one pending confirmation and confirm the 60-second cooldown is enforced. Bulk sending uses 250-recipient keyset batches, 5 workers, and a pooled SMTP transport; the UI loops until `nextCursor` is null. An interrupted campaign has no idempotency key, so a retry can resend to recipients who already received the message.

## Accepted and deferred risks

These items are known and accepted for the current release.

- **Public Firebase Realtime Database reads.** `firebase.rules.json` allows public reads of the `region_settings`, `blocks`, and sprayer subtrees, including control state, telemetry, and history, while denying writes. Those nodes must be treated as public data. Do not store personal data, credentials, or operational secrets in the RTDB.
- **App Check enforcement is manual.** Client initialization does not enforce App Check. Enforcement for Realtime Database must be enabled in the Firebase Console, and the deny-by-default write rules remain the primary write control.
- **Automatic mode is a guarded hardware switch with no scheduler here.** `Region.automaticMode` is the authoritative region-wide switch: enabling it sets every active sprayer to `AUTO/OFF`; disabling returns them to `MANUAL/OFF`. SQL is authoritative and the Firebase `region_settings` node is a mirror. The application does not run a server-side watering scheduler, so device or consumer firmware must act on the per-sprayer AUTO mode; `showAutoIrrigation` only controls display visibility.
- **Automatic-mode serialization is process-local.** `withAutomaticModeLock` serializes toggles and settings mirrors within one process. Keep the deployment at a single replica until a distributed lock exists; two processes can interleave a toggle with its compensation.
- **Automatic-mode compensation has no durable retry.** A partial enable is compensated back to `MANUAL/OFF` with up to three attempts per sprayer. If that restore is still incomplete, the action returns `503` and logs the affected sprayers server-side; there is no `RESTORE_PENDING` marker or retry worker yet. A pre-existing Firebase `FAILED` marker is sticky: a successful toggle or settings mirror does not clear an unrepaired rename/provisioning failure.
- **Newsletter double opt-in is implemented with residual delivery and campaign risks.** Public subscribe creates or rotates a `PENDING` row for a new or previously unsubscribed address and sends a detached confirmation email; only a button click on `/newsletter/confirm?token=...` changes it to `CONFIRMED`. Confirmation tokens are hashed, expire after 1-168 hours (default 24), and are consumed once. Unsubscribe tokens are signed, verified in constant time, and intentionally do not expire. The confirmation email is not retried automatically and the database row is the source of truth; admin resend recovers delivery failures after a 60-second cooldown. The same migration backfills legacy active subscribers to `CONFIRMED` with `consent_source='LEGACY_IMPORT'`; they were not re-consented. Bulk sending has no cross-tab or campaign idempotency, so retrying an interrupted campaign can duplicate mail.
- **API-key authentication was removed.** `UserProfile.apiKey` and `user_detail.api_key` were dropped by `20261021140000_newsletter_double_opt_in_and_drop_api_key`; there is no API-key authentication surface.
- **Firebase sync is a full snapshot with a global marker.** Each refresh walks every region and reads whole RTDB nodes. `firebase_sync:snapshot` is a global freshness marker, not a per-node high-water mark, so completed reads are not tracked incrementally.
- **No clustered sync leader election.** The in-flight sync promise is per process. Multiple replicas can run a full sync at the same time; the global marker only reduces how often a refresh starts.
- **Scoped history can filesort.** Global history uses the `(started_at, id)` keyset index, but region/block-scoped queries filter through `sprayer.block_id`, which the index cannot fully serve. The sort set is bounded by the user's scope and selected date range rather than the full table, and `LIMIT` bounds the returned page, not the sort set. Monitor it as history grows.
- **The header-marked `/_server` GET transport is defense-in-depth.** A DNS-rebinding attacker can invoke only unauthenticated public GET actions because the `__Host-` session cookie is not sent to the attacker hostname; authenticated mutations remain blocked by exact-origin POST checks. Terminate TLS at a proxy that preserves and validates the public `Host` and rejects unknown hostnames.
- **This release is intended to be served at `/`.** Sub-path mounting is unsupported because the middleware `/_server` guard matches the root path.
- **Rate-limit buckets are in-process and bounded.** Public rate-limit counters live in a 20,000-entry in-process map; extreme source-IP cardinality can evict older buckets. Use proxy-level limiting for internet-facing deployments.
- **Migration lock and rebuild window.** The migration set drops columns and indexes and may rebuild large tables under metadata locks. It requires a maintenance window and a tested backup.
- **No automated test runner yet.** The repository has typecheck, lint, and format scripts, but no `test` script or test framework. Verification is manual: `bun run check` plus the smoke checks above.

## Seeding

`bun run db:seed` is intended for local development and controlled demo environments. It is never part of the production deploy sequence.

- Production seeding requires `SEED_PASSWORD` or the role-specific `SEED_SUPERADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD`, and `SEED_USER_PASSWORD`.
- `SEED_ALLOW_DEMO=true` is only for local or demo seeding. It enables the built-in demo passwords and must not be used for a shared or production database.
- Seed reruns are non-destructive to existing accounts and core data: existing users are not re-hashed or overwritten, and region, block, sprayer, threshold, and assignment writes use `upsert` with empty updates. A rerun still updates the `seed.version` marker and appends a seed audit entry.

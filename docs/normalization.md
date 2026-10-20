# BCNF Normalization

This document describes the normalization applied to the Adosistering schema, the functional dependencies it removed, and how to verify the change after deployment. It reflects the implementation in `prisma/schema.prisma` and the ordered SQL under `prisma/migrations`.

## Goal

Control settings, display preferences, block scope, and alert scope were stored in more than one place. The same region-level value could exist in a `system_setting` JSON document, a `Region` row, and every user's `IndicatorThreshold` row. Time-series and audit tables also duplicated `blockId`, even though a sprayer already determines its block.

The normalization stores each fact once:

- Region control values live on `region`.
- Per-user display values live on `indicator_threshold`.
- Block scope is derived through `sprayer`.
- Alert scope is one normalized target row.
- Historical rows keep stable references after a user is deleted.

## Functional dependencies removed

- `region.name -> dry/wet limits, automatic mode, safety timeouts` was split across `system_setting` keys named `region_settings:<region name>` and `safetyTimeout:<region id>`. The region row is now the single source of truth for that region.
- `(userId, regionId) -> dry_max_percent, wet_min_percent` duplicated region-level control limits in every user threshold row. Those columns were removed; only display fields remain.
- `sensor_reading.sprayer_id -> block_id` and `irrigation_event.sprayer_id -> block_id` were transitive dependencies. `block_id` was removed from both tables.
- `activity_log.block_id` duplicated scope reachable through the related entity. It was removed after the legacy value was preserved in `metadata.legacyBlockId`.
- `alert_notification -> {region_id, block_id, sprayer_id}` represented one scope through three nullable columns. It is replaced by a single `alert_notification_target` row.
- Hard-deleting a user destroyed the identity referenced by history. Deletion is now a soft delete plus anonymization, so activity, irrigation, email, and alert history survive.

## Model changes

### Region owns control settings

`Region` now stores:

- `dryMaxPercent` (default `40`)
- `wetMinPercent` (default `80`)
- `automaticMode` (default `false`)
- `safetyTimeoutMin` (default `1`)
- `safetyTimeoutMax` (default `3`)

These columns are the authoritative per-region values used by the settings actions and by the Firebase mirror. The app writes `region_settings` in the Realtime Database from the region row; it does not read that node back as a source of truth.

The global `safetyTimeout` key in `system_setting` is still used as an application-level default, for example when no region context exists. It is not a per-region override, and changing it after the migration does not rewrite existing region rows. All `region_settings:%` and `safetyTimeout:%` rows are deleted by the migration.

### IndicatorThreshold is display-only

`IndicatorThreshold` keeps:

- `displayDryMaxPercent` (default `40`)
- `displayMoistMaxPercent` (default `70`)
- `displayWetMinPercent` (default `80`)
- `landPreference` (default `LEMBAB`)

The legacy `dry_max_percent` and `wet_min_percent` columns were dropped. A row is still unique per `(userId, regionId)` and is removed when the user or region is deleted.

### SensorReading uses a source key

`SensorReading` now has `sourceKey` (`VARCHAR(191)`) and a unique constraint on `(sprayerId, sourceKey)`. It no longer has `blockId`.

The source key is a stable value derived from the source payload or event identifier. It makes Firebase ingestion idempotent and allows multiple readings in the same second, which the previous `(sprayer_id, recorded_at)` unique constraint rejected. Existing rows are backfilled with `legacy:<id>` before the column becomes `NOT NULL`.

Block scope is queried through the relation:

```text
SensorReading -> Sprayer -> Block
```

### IrrigationEvent and ActivityLog drop duplicated block scope

`IrrigationEvent` no longer stores `blockId`; block and region scope come from its `sprayer`. The migration also widens `firebase_event_id` to `VARCHAR(512)`, `firebase_date_key` to `VARCHAR(64)`, and `reason` to `VARCHAR(255)`.

`ActivityLog` no longer stores `blockId`. Before the column is dropped, any non-null value is copied to `metadata.legacyBlockId`:

```sql
UPDATE `activity_log`
SET `metadata` = JSON_SET(COALESCE(`metadata`, '{}'), '$.legacyBlockId', `block_id`)
WHERE `block_id` IS NOT NULL;
```

`ActivityLog.regionId` remains nullable because an audit entry can be global or not tied to a region.

### AlertNotificationTarget replaces alert hierarchy columns

`AlertNotificationTarget` has at most one row per alert:

- `alertId` is both the primary key and the foreign key to `AlertNotification`.
- `targetType` is `REGION`, `BLOCK`, or `SPRAYER`.
- `targetId` is the identifier for that scope.

The migration copies the most specific legacy scope in the order `sprayer > block > region`. Alerts with no legacy scope keep no target row. Deleting an alert cascades to its target.

### User deletion is soft delete plus anonymization

`User` has a nullable `deletedAt` column and an index on it. The delete action:

- Deletes sessions, password-reset tokens, profile data, per-user thresholds, and region assignments.
- Reassigns rows created or updated by the deleted user to the acting administrator.
- Sets `email` to `deleted+<id>@deleted.invalid`, `name` to `Pengguna Dihapus`, `isActive` to `false`, and `deletedAt` to the deletion time.
- Replaces `passwordHash` with a hash of a fresh random token.

Existing activity, irrigation, email, and alert rows keep their references. Relations that allow a null actor use `onDelete: SetNull`, so even a future maintenance purge would not cascade-delete history.

### String widths

The same migration aligns string widths with the validators, including `user.email` (`254`), `user.name` (`100`), `region.name` (`100`), `session.token_hash` (`64`), `activity_log.entity_type` (`64`), `activity_log.entity_id` (`191`), and `activity_log.user_agent` (`512`). Check for overlong values before applying the migration under strict SQL mode.

## Migration sequence

The SQL follows an expand, backfill, contract order. This is what makes the change data-preserving on a non-empty production database.

### 1. Expand

New region columns are added with defaults. `sensor_reading.source_key` is added as nullable. `alert_notification_target` is created. Existing columns and foreign keys remain in place, but the previous release does not populate `source_key`; stop application writes before the migration starts so rows inserted during the backfill cannot leave it null.

### 2. Backfill

- Region limits are copied from `region_settings:<region name>`. `JSON_TYPE` guards ensure malformed or missing JSON values leave the defaults in place.
- Regions without a `region_settings` row inherit the latest `indicator_threshold` row for that region, ordered by `updated_at DESC, id DESC`.
- Safety timeouts come from `safetyTimeout:<region id>`, then the global `safetyTimeout` key, then the `1`/`3` defaults.
- `sensor_reading.source_key` is filled with `legacy:<id>` where it is still null.
- `activity_log.metadata.legacyBlockId` receives the old block identifier.
- `alert_notification_target` receives the most specific legacy scope.

No legacy column is dropped before its value has been copied to the new location.

### 3. Contract

The migration drops the superseded columns, foreign keys, and indexes, makes `source_key` non-null, creates the new unique index, and deletes the per-region settings keys. Stop the old release before the migration starts, not only before this phase: code from the previous release still expects `block_id` and the legacy threshold columns.

The sequence is data-preserving because:

- Values are copied before their source columns are removed.
- Malformed legacy JSON is ignored rather than coerced into a wrong value.
- Legacy sensor rows receive a deterministic key instead of being deleted.
- Audit block scope is preserved inside JSON metadata.
- Alert scope is preserved in the normalized target table.
- No table is truncated, and user rows are retained.

## Migrations

The delta spans two migrations that touch these tables, followed by an index-only cleanup:

- `prisma/migrations/20261020120000_security_hardening_and_indexes` adds session expiry metadata and `login_throttle`, plus the query-pattern indexes used before normalization. It also removes older duplicate readings that share a `(sprayer_id, recorded_at)` pair and creates the old unique index that the BCNF migration replaces.
- `prisma/migrations/20261021120000_bcnf_normalization` performs the region, threshold, sensor, event, audit, alert, user, and string-width changes described above.
- `prisma/migrations/20261021130000_drop_redundant_event_indexes` is the follow-up index migration. It drops `irrigation_event_firebase_event_id_idx` because the unique index already covers `firebase_event_id`, and drops `irrigation_event_started_at_idx` because `started_at` is the leading column of `irrigation_event_started_at_id_idx`.

Apply them in filename order with `bun run db:deploy`. Do not edit an applied migration or run the SQL manually on production.

## Post-migration verification

Run these checks against the production database after `prisma migrate deploy` and before starting the new release.

### Region values

```sql
SELECT id, name, dry_max_percent, wet_min_percent, automatic_mode,
       safety_timeout_min, safety_timeout_max
FROM region
ORDER BY name;
```

Compare the rows with the values captured from `system_setting` and the previous settings screen. A region with no `region_settings` row and no threshold row keeps the `40` / `80` / `false` defaults. Its safety timeout comes from the global `safetyTimeout` fallback when that key exists, otherwise from the `1` / `3` defaults.

### Threshold columns

```sql
SHOW COLUMNS FROM indicator_threshold LIKE 'dry_max_percent';
SHOW COLUMNS FROM indicator_threshold LIKE 'wet_min_percent';
```

Both statements must return an empty set. The `display_*` columns should still be present.

### Legacy setting keys

```sql
SELECT `key`
FROM system_setting
WHERE LEFT(`key`, 16) = 'region_settings:'
   OR `key` LIKE 'safetyTimeout:%';
```

The result must be empty. The global `safetyTimeout` key without a colon is intentionally kept.

### Duplicate sensor source keys

```sql
SELECT sprayer_id, source_key, COUNT(*) AS row_count
FROM sensor_reading
GROUP BY sprayer_id, source_key
HAVING COUNT(*) > 1;

SELECT COUNT(*) AS null_source_keys
FROM sensor_reading
WHERE source_key IS NULL;
```

The duplicate query must return no rows, and `null_source_keys` must be `0`. Then confirm the unique index exists:

```sql
SHOW INDEX FROM sensor_reading
WHERE Key_name = 'sensor_reading_sprayer_id_source_key_key';
```

Expect two rows, one for each indexed column (`sprayer_id` at `Seq_in_index = 1`, `source_key` at `Seq_in_index = 2`), both with `Non_unique = 0`. Confirm `sensor_reading_block_id_recorded_at_idx` and the `block_id` column are gone:

```sql
SHOW COLUMNS FROM sensor_reading LIKE 'block_id';
SHOW COLUMNS FROM irrigation_event LIKE 'block_id';
SHOW COLUMNS FROM activity_log LIKE 'block_id';
```

Each `SHOW COLUMNS` must return an empty set.

### Event index inventory

```sql
SELECT index_name,
       GROUP_CONCAT(column_name ORDER BY seq_in_index) AS indexed_columns,
       non_unique
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'irrigation_event'
GROUP BY index_name, non_unique
ORDER BY index_name;
```

Expected indexes include:

- `PRIMARY` on `id`
- `irrigation_event_firebase_event_id_key` (unique)
- `irrigation_event_sprayer_id_started_at_idx`
- `irrigation_event_sprayer_id_relay_ended_at_idx`
- `irrigation_event_mode_started_at_idx`
- `irrigation_event_actor_id_idx`
- `irrigation_event_firebase_date_key_idx`
- `irrigation_event_started_at_id_idx`

Expected absent:

- `irrigation_event_firebase_event_id_idx`
- `irrigation_event_started_at_idx`
- Any index whose leading column is `block_id`

### Alert target coverage

Capture the legacy scoped count before applying the migration:

```sql
SELECT COUNT(*) AS legacy_scoped_alerts
FROM alert_notification
WHERE region_id IS NOT NULL
   OR block_id IS NOT NULL
   OR sprayer_id IS NOT NULL;
```

After the migration, compare it with the normalized table:

```sql
SELECT COUNT(*) AS total_targets FROM alert_notification_target;

SELECT target_type, COUNT(*) AS row_count
FROM alert_notification_target
GROUP BY target_type;
```

`total_targets` should equal `legacy_scoped_alerts`. Alerts with no legacy scope legitimately have no target row.

### Prisma status and drift

```bash
bunx prisma migrate status
bunx prisma migrate diff \
  --from-config-datasource \
  --to-schema=prisma/schema.prisma \
  --exit-code
```

`migrate status` must report that the database is up to date. `migrate diff` exits with `0` when there is no drift and `2` when schema differences remain. It compares schema, not data, so the SQL checks above are still required.

## Irreversibility and rollback

The BCNF migration is irreversible. There is no down migration, and MySQL/MariaDB DDL commits implicitly, so a failure partway through can leave a partially transformed schema. Before applying it:

1. Take a full backup and test the restore procedure.
2. Rehearse on a production-sized snapshot.
3. Record row counts and legacy setting values.
4. Schedule a maintenance window; stop the old application before the contract phase.

If the migration fails, do not rerun it blindly. Inspect `_prisma_migrations` and the actual schema, then either restore the backup and redeploy the previous release or forward-fix with a reviewed migration. Restoring the backup is the rollback path.

See [deployment.md](./deployment.md) for the full release procedure.

-- BCNF normalization
-- ---------------------------------------------------------------------------
-- 1. Region becomes the relational source of region-wide control settings
--    (replacing the legacy per-region system_setting JSON documents).
-- 2. Remove transitive sprayer -> block dependencies from time-series and
--    audit tables.
-- 3. Replace alert scope columns with a 1:1 normalized target row.
-- 4. Align string widths with the application validators.
--
-- Ordering is widths -> add -> backfill -> drop so the migration is safe on a
-- non-empty production database: no legacy column is removed before its value
-- has been copied to its new location.

-- ---------------------------------------------------------------------------
-- String widths first. Several targets are narrower than the legacy
-- VARCHAR(191) columns, so a legacy value that does not fit fails here under
-- strict SQL mode, before any column, index, or row has been dropped. Every
-- statement in this block is idempotent: after fixing the offending rows,
-- mark the migration rolled back and deploy again.
-- ---------------------------------------------------------------------------
ALTER TABLE `user`
    MODIFY COLUMN `email` VARCHAR(254) NOT NULL,
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `password_hash` VARCHAR(255) NOT NULL;

ALTER TABLE `user_detail`
    MODIFY COLUMN `whatsapp` VARCHAR(32) NULL,
    MODIFY COLUMN `nickname` VARCHAR(100) NULL,
    MODIFY COLUMN `gender` VARCHAR(32) NULL,
    MODIFY COLUMN `alt_phone` VARCHAR(32) NULL,
    MODIFY COLUMN `occupation` VARCHAR(120) NULL,
    MODIFY COLUMN `domicile` VARCHAR(120) NULL,
    MODIFY COLUMN `address` VARCHAR(500) NULL,
    MODIFY COLUMN `country` VARCHAR(100) NULL,
    MODIFY COLUMN `province` VARCHAR(100) NULL,
    MODIFY COLUMN `city` VARCHAR(100) NULL,
    MODIFY COLUMN `postal_code` VARCHAR(20) NULL,
    MODIFY COLUMN `device_username` VARCHAR(100) NULL,
    MODIFY COLUMN `api_key` VARCHAR(255) NULL;

ALTER TABLE `session`
    MODIFY COLUMN `token_hash` VARCHAR(64) NOT NULL;

ALTER TABLE `password_reset_token`
    MODIFY COLUMN `token_hash` VARCHAR(64) NOT NULL;

ALTER TABLE `region`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `description` VARCHAR(1000) NULL;

ALTER TABLE `block`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL;

ALTER TABLE `sprayer`
    MODIFY COLUMN `hardware_id` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `display_name` VARCHAR(100) NOT NULL;

ALTER TABLE `map_layer`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL;

ALTER TABLE `sensor_reading`
    MODIFY COLUMN `pump_status` VARCHAR(16) NOT NULL,
    MODIFY COLUMN `wind_direction` VARCHAR(100) NULL;

ALTER TABLE `irrigation_event`
    MODIFY COLUMN `reason` VARCHAR(255) NULL,
    MODIFY COLUMN `firebase_event_id` VARCHAR(512) NULL,
    MODIFY COLUMN `firebase_date_key` VARCHAR(64) NULL;

ALTER TABLE `activity_log`
    MODIFY COLUMN `entity_type` VARCHAR(64) NOT NULL,
    MODIFY COLUMN `entity_id` VARCHAR(191) NULL,
    MODIFY COLUMN `ip_address` VARCHAR(64) NULL,
    MODIFY COLUMN `user_agent` VARCHAR(512) NULL;

ALTER TABLE `alert_notification`
    MODIFY COLUMN `title` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `message` TEXT NOT NULL;

ALTER TABLE `email_delivery`
    MODIFY COLUMN `to_email` VARCHAR(254) NOT NULL,
    MODIFY COLUMN `subject` VARCHAR(200) NOT NULL,
    MODIFY COLUMN `provider` VARCHAR(32) NOT NULL,
    MODIFY COLUMN `provider_id` VARCHAR(255) NULL,
    MODIFY COLUMN `error` TEXT NULL;

ALTER TABLE `contact_submission`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `email` VARCHAR(254) NOT NULL,
    MODIFY COLUMN `phone` VARCHAR(32) NULL,
    MODIFY COLUMN `user_type` VARCHAR(64) NULL;

ALTER TABLE `landing_testimonial`
    MODIFY COLUMN `role` VARCHAR(120) NOT NULL,
    MODIFY COLUMN `image_url` VARCHAR(2048) NULL;

ALTER TABLE `landing_location`
    MODIFY COLUMN `image_url` VARCHAR(2048) NULL;

ALTER TABLE `landing_partner`
    MODIFY COLUMN `logo_url` VARCHAR(2048) NULL,
    MODIFY COLUMN `website_url` VARCHAR(2048) NULL;

ALTER TABLE `newsletter_subscriber`
    MODIFY COLUMN `email` VARCHAR(254) NOT NULL;

-- ---------------------------------------------------------------------------
-- Region settings: columns first, then backfill, then legacy keys removed.
-- ---------------------------------------------------------------------------
ALTER TABLE `region`
    ADD COLUMN `dry_max_percent` INTEGER NOT NULL DEFAULT 40,
    ADD COLUMN `wet_min_percent` INTEGER NOT NULL DEFAULT 80,
    ADD COLUMN `automatic_mode` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `safety_timeout_min` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `safety_timeout_max` INTEGER NOT NULL DEFAULT 3;

-- Backfill from region_settings:<region name>, a verbatim copy of the Firebase
-- node the devices read. Numbers and numeric strings are accepted, rounded,
-- and clamped to the validator range (0-100); anything else keeps the new
-- default. ROUND on the unquoted text avoids CAST(... AS SIGNED), which
-- strict mode rejects for fractional input such as 42.7.
UPDATE `region` AS r
INNER JOIN `system_setting` AS s
    ON s.`key` = CONCAT('region_settings:', r.`name`)
SET
    r.`dry_max_percent` = CASE
        WHEN JSON_TYPE(JSON_EXTRACT(s.`value`, '$.batas_kering')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
          OR (JSON_TYPE(JSON_EXTRACT(s.`value`, '$.batas_kering')) = 'STRING'
              AND JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.batas_kering')) REGEXP '^[0-9]+([.][0-9]+)?$')
            THEN LEAST(100, GREATEST(0, ROUND(JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.batas_kering')))))
        ELSE r.`dry_max_percent`
    END,
    r.`wet_min_percent` = CASE
        WHEN JSON_TYPE(JSON_EXTRACT(s.`value`, '$.batas_basah')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
          OR (JSON_TYPE(JSON_EXTRACT(s.`value`, '$.batas_basah')) = 'STRING'
              AND JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.batas_basah')) REGEXP '^[0-9]+([.][0-9]+)?$')
            THEN LEAST(100, GREATEST(0, ROUND(JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.batas_basah')))))
        ELSE r.`wet_min_percent`
    END,
    r.`automatic_mode` = CASE
        WHEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.mode_otomatis'))) IN ('true', '1') THEN true
        ELSE false
    END;

-- Regions without a region_settings row inherit the latest per-region
-- threshold row (latest updated_at, id as deterministic tie-break).
UPDATE `region` AS r
INNER JOIN `indicator_threshold` AS it
    ON it.`region_id` = r.`id`
LEFT JOIN `system_setting` AS s
    ON s.`key` = CONCAT('region_settings:', r.`name`)
SET
    r.`dry_max_percent` = it.`dry_max_percent`,
    r.`wet_min_percent` = it.`wet_min_percent`
WHERE s.`key` IS NULL
  AND it.`id` = (
      SELECT latest.`id`
      FROM `indicator_threshold` AS latest
      WHERE latest.`region_id` = r.`id`
      ORDER BY latest.`updated_at` DESC, latest.`id` DESC
      LIMIT 1
  );

-- Safety timeouts mirror the legacy reader: only JSON numbers count; each
-- per-region field falls back to the global safetyTimeout document, whose own
-- fields fall back to 1/3; a pair with min >= max falls back as a whole.
-- Values are rounded and clamped to the validator range (1-10).
UPDATE `region` AS r
LEFT JOIN `system_setting` AS rs
    ON rs.`key` = CONCAT('safetyTimeout:', r.`id`)
LEFT JOIN `system_setting` AS gs
    ON gs.`key` = 'safetyTimeout'
SET
    r.`safety_timeout_min` = COALESCE(
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(rs.`value`, '$.min')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
                THEN LEAST(10, GREATEST(1, ROUND(JSON_UNQUOTE(JSON_EXTRACT(rs.`value`, '$.min')))))
        END,
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(gs.`value`, '$.min')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
                THEN LEAST(10, GREATEST(1, ROUND(JSON_UNQUOTE(JSON_EXTRACT(gs.`value`, '$.min')))))
        END,
        1
    ),
    r.`safety_timeout_max` = COALESCE(
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(rs.`value`, '$.max')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
                THEN LEAST(10, GREATEST(1, ROUND(JSON_UNQUOTE(JSON_EXTRACT(rs.`value`, '$.max')))))
        END,
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(gs.`value`, '$.max')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
                THEN LEAST(10, GREATEST(1, ROUND(JSON_UNQUOTE(JSON_EXTRACT(gs.`value`, '$.max')))))
        END,
        3
    );

-- Invalid pairs fall back to the global pair, or 1/3 when that is invalid too.
UPDATE `region` AS r
CROSS JOIN (
    SELECT
        CASE WHEN g.`min_value` < g.`max_value` THEN g.`min_value` ELSE 1 END AS `min_value`,
        CASE WHEN g.`min_value` < g.`max_value` THEN g.`max_value` ELSE 3 END AS `max_value`
    FROM (
        SELECT
            COALESCE(MAX(CASE
                WHEN JSON_TYPE(JSON_EXTRACT(s.`value`, '$.min')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
                    THEN LEAST(10, GREATEST(1, ROUND(JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.min')))))
            END), 1) AS `min_value`,
            COALESCE(MAX(CASE
                WHEN JSON_TYPE(JSON_EXTRACT(s.`value`, '$.max')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')
                    THEN LEAST(10, GREATEST(1, ROUND(JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.max')))))
            END), 3) AS `max_value`
        FROM `system_setting` AS s
        WHERE s.`key` = 'safetyTimeout'
    ) AS g
) AS fallback
SET
    r.`safety_timeout_min` = fallback.`min_value`,
    r.`safety_timeout_max` = fallback.`max_value`
WHERE r.`safety_timeout_min` >= r.`safety_timeout_max`;

-- IndicatorThreshold now holds per-user display preferences only.
ALTER TABLE `indicator_threshold`
    DROP COLUMN `dry_max_percent`,
    DROP COLUMN `wet_min_percent`;

-- ---------------------------------------------------------------------------
-- SensorReading: block is reachable through sprayer, so drop the transitive
-- column. A source key replaces recorded_at in the uniqueness constraint so
-- multiple readings in the same second are no longer discarded.
-- ---------------------------------------------------------------------------
ALTER TABLE `sensor_reading`
    ADD COLUMN `source_key` VARCHAR(191) NULL AFTER `sprayer_id`;

UPDATE `sensor_reading`
SET `source_key` = CONCAT('legacy:', `id`)
WHERE `source_key` IS NULL;

ALTER TABLE `sensor_reading`
    MODIFY COLUMN `source_key` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `sensor_reading_sprayer_id_source_key_key`
    ON `sensor_reading`(`sprayer_id`, `source_key`);

-- Cycle the sprayer FK so dropping the superseded unique index cannot fail
-- with "needed in a foreign key constraint"; another sprayer_id index exists
-- immediately after this block.
ALTER TABLE `sensor_reading`
    DROP FOREIGN KEY `sensor_reading_sprayer_id_fkey`;

ALTER TABLE `sensor_reading`
    DROP INDEX `sensor_reading_sprayer_id_recorded_at_key`;

ALTER TABLE `sensor_reading`
    ADD CONSTRAINT `sensor_reading_sprayer_id_fkey`
    FOREIGN KEY (`sprayer_id`) REFERENCES `sprayer`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sensor_reading`
    DROP FOREIGN KEY `sensor_reading_block_id_fkey`;

ALTER TABLE `sensor_reading`
    DROP INDEX `sensor_reading_block_id_recorded_at_idx`;

ALTER TABLE `sensor_reading`
    DROP COLUMN `block_id`;

-- ---------------------------------------------------------------------------
-- IrrigationEvent: same transitive block removal and a stable (started_at, id)
-- keyset-pagination index.
-- ---------------------------------------------------------------------------
CREATE INDEX `irrigation_event_started_at_id_idx`
    ON `irrigation_event`(`started_at`, `id`);

ALTER TABLE `irrigation_event`
    DROP FOREIGN KEY `irrigation_event_block_id_fkey`;

ALTER TABLE `irrigation_event`
    DROP INDEX `irrigation_event_block_id_started_at_idx`;

ALTER TABLE `irrigation_event`
    DROP INDEX `irrigation_event_block_id_relay_started_at_idx`;

ALTER TABLE `irrigation_event`
    DROP COLUMN `block_id`;

-- ---------------------------------------------------------------------------
-- ActivityLog: preserve the dropped block reference inside metadata before
-- removing the column. JSON_SET cannot add a key to an array or JSON null, so
-- non-object metadata is kept under `legacyMetadata` instead.
-- ---------------------------------------------------------------------------
UPDATE `activity_log`
SET `metadata` = CASE
    WHEN `metadata` IS NULL THEN JSON_OBJECT('legacyBlockId', `block_id`)
    WHEN JSON_TYPE(`metadata`) = 'OBJECT' THEN JSON_SET(`metadata`, '$.legacyBlockId', `block_id`)
    ELSE JSON_OBJECT('legacyBlockId', `block_id`, 'legacyMetadata', JSON_EXTRACT(`metadata`, '$'))
END
WHERE `block_id` IS NOT NULL;

ALTER TABLE `activity_log`
    DROP FOREIGN KEY `activity_log_block_id_fkey`;

-- The block_id column drop also removes the FK-supporting index, whose name
-- matches the constraint name (`activity_log_block_id_fkey`).
ALTER TABLE `activity_log`
    DROP COLUMN `block_id`;

-- ---------------------------------------------------------------------------
-- Alert notifications: one normalized 1:1 target instead of three nullable
-- scope columns. Keep the most specific legacy scope (sprayer > block >
-- region); alerts with no scope keep no target row.
-- ---------------------------------------------------------------------------
CREATE TABLE `alert_notification_target` (
    `alert_id` VARCHAR(191) NOT NULL,
    `target_type` ENUM('REGION', 'BLOCK', 'SPRAYER') NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,

    INDEX `alert_notification_target_target_type_target_id_idx`(`target_type`, `target_id`),
    PRIMARY KEY (`alert_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `alert_notification_target`
    ADD CONSTRAINT `alert_notification_target_alert_id_fkey`
    FOREIGN KEY (`alert_id`) REFERENCES `alert_notification`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `alert_notification_target` (`alert_id`, `target_type`, `target_id`)
SELECT
    `id`,
    CASE
        WHEN `sprayer_id` IS NOT NULL THEN 'SPRAYER'
        WHEN `block_id` IS NOT NULL THEN 'BLOCK'
        ELSE 'REGION'
    END,
    COALESCE(`sprayer_id`, `block_id`, `region_id`)
FROM `alert_notification`
WHERE COALESCE(`sprayer_id`, `block_id`, `region_id`) IS NOT NULL;

ALTER TABLE `alert_notification`
    DROP FOREIGN KEY `alert_notification_region_id_fkey`;

ALTER TABLE `alert_notification`
    DROP FOREIGN KEY `alert_notification_block_id_fkey`;

ALTER TABLE `alert_notification`
    DROP FOREIGN KEY `alert_notification_sprayer_id_fkey`;

-- The scope column drops also remove the FK-supporting indexes, whose names
-- match the dropped constraint names.
ALTER TABLE `alert_notification`
    DROP COLUMN `region_id`,
    DROP COLUMN `block_id`,
    DROP COLUMN `sprayer_id`;

-- ---------------------------------------------------------------------------
-- User: soft-delete marker.
-- ---------------------------------------------------------------------------
ALTER TABLE `user`
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

CREATE INDEX `user_deleted_at_idx` ON `user`(`deleted_at`);

-- ---------------------------------------------------------------------------
-- Legacy per-entity settings are now represented by region columns. Keep the
-- global safetyTimeout document and all other system_setting rows.
-- ---------------------------------------------------------------------------
DELETE FROM `system_setting`
WHERE `key` LIKE 'region_settings:%'
   OR `key` LIKE 'safetyTimeout:%';

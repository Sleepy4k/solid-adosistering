-- BCNF normalization
-- ---------------------------------------------------------------------------
-- 1. Region becomes the relational source of region-wide control settings
--    (replacing the legacy per-region system_setting JSON documents).
-- 2. Remove transitive sprayer -> block dependencies from time-series and
--    audit tables.
-- 3. Replace alert scope columns with a 1:1 normalized target row.
-- 4. Align string widths with the application validators.
--
-- Ordering is add -> backfill -> drop so the migration is safe on a non-empty
-- production database: no legacy column is removed before its value has been
-- copied to its new location.

-- ---------------------------------------------------------------------------
-- Region settings: columns first, then backfill, then legacy keys removed.
-- ---------------------------------------------------------------------------
ALTER TABLE `region`
    ADD COLUMN `dry_max_percent` INTEGER NOT NULL DEFAULT 40,
    ADD COLUMN `wet_min_percent` INTEGER NOT NULL DEFAULT 80,
    ADD COLUMN `automatic_mode` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `safety_timeout_min` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `safety_timeout_max` INTEGER NOT NULL DEFAULT 3;

-- Backfill from region_settings:<region name>. Numeric extraction is guarded
-- by JSON_TYPE so malformed legacy values leave the new default in place.
UPDATE `region` AS r
INNER JOIN `system_setting` AS s
    ON s.`key` = CONCAT('region_settings:', r.`name`)
SET
    r.`dry_max_percent` = CASE
        WHEN JSON_TYPE(JSON_EXTRACT(s.`value`, '$.batas_kering')) IN ('INTEGER', 'DOUBLE', 'DECIMAL')
            THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.batas_kering')) AS SIGNED)
        ELSE r.`dry_max_percent`
    END,
    r.`wet_min_percent` = CASE
        WHEN JSON_TYPE(JSON_EXTRACT(s.`value`, '$.batas_basah')) IN ('INTEGER', 'DOUBLE', 'DECIMAL')
            THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.batas_basah')) AS SIGNED)
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

-- Safety timeouts: per-region key, then global key, then 1/3 defaults.
UPDATE `region` AS r
LEFT JOIN `system_setting` AS rs
    ON rs.`key` = CONCAT('safetyTimeout:', r.`id`)
LEFT JOIN `system_setting` AS gs
    ON gs.`key` = 'safetyTimeout'
SET
    r.`safety_timeout_min` = COALESCE(
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(rs.`value`, '$.min')) IN ('INTEGER', 'DOUBLE', 'DECIMAL')
                THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(rs.`value`, '$.min')) AS SIGNED)
        END,
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(gs.`value`, '$.min')) IN ('INTEGER', 'DOUBLE', 'DECIMAL')
                THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(gs.`value`, '$.min')) AS SIGNED)
        END,
        1
    ),
    r.`safety_timeout_max` = COALESCE(
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(rs.`value`, '$.max')) IN ('INTEGER', 'DOUBLE', 'DECIMAL')
                THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(rs.`value`, '$.max')) AS SIGNED)
        END,
        CASE
            WHEN JSON_TYPE(JSON_EXTRACT(gs.`value`, '$.max')) IN ('INTEGER', 'DOUBLE', 'DECIMAL')
                THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(gs.`value`, '$.max')) AS SIGNED)
        END,
        3
    );

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
    ADD COLUMN `source_key` VARCHAR(191) NULL AFTER `sprayer_id`,
    MODIFY COLUMN `pump_status` VARCHAR(16) NOT NULL,
    MODIFY COLUMN `wind_direction` VARCHAR(100) NULL;

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
-- IrrigationEvent: same transitive block removal, widened Firebase fields and
-- a stable (started_at, id) keyset-pagination index.
-- ---------------------------------------------------------------------------
ALTER TABLE `irrigation_event`
    MODIFY COLUMN `reason` VARCHAR(255) NULL,
    MODIFY COLUMN `firebase_event_id` VARCHAR(512) NULL,
    MODIFY COLUMN `firebase_date_key` VARCHAR(64) NULL;

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
-- removing the column, then align audit string widths.
-- ---------------------------------------------------------------------------
UPDATE `activity_log`
SET `metadata` = JSON_SET(COALESCE(`metadata`, '{}'), '$.legacyBlockId', `block_id`)
WHERE `block_id` IS NOT NULL;

ALTER TABLE `activity_log`
    MODIFY COLUMN `entity_type` VARCHAR(64) NOT NULL,
    MODIFY COLUMN `entity_id` VARCHAR(191) NULL,
    MODIFY COLUMN `ip_address` VARCHAR(64) NULL,
    MODIFY COLUMN `user_agent` VARCHAR(512) NULL;

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
    DROP COLUMN `sprayer_id`,
    MODIFY COLUMN `title` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `message` TEXT NOT NULL;

-- ---------------------------------------------------------------------------
-- User: soft-delete marker and validator-aligned identity widths.
-- ---------------------------------------------------------------------------
ALTER TABLE `user`
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    MODIFY COLUMN `email` VARCHAR(254) NOT NULL,
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `password_hash` VARCHAR(255) NOT NULL;

CREATE INDEX `user_deleted_at_idx` ON `user`(`deleted_at`);

-- ---------------------------------------------------------------------------
-- Remaining string-width alignment.
-- ---------------------------------------------------------------------------
ALTER TABLE `region`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `description` VARCHAR(1000) NULL;

ALTER TABLE `contact_submission`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `email` VARCHAR(254) NOT NULL,
    MODIFY COLUMN `phone` VARCHAR(32) NULL,
    MODIFY COLUMN `user_type` VARCHAR(64) NULL;

ALTER TABLE `block`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL;

ALTER TABLE `sprayer`
    MODIFY COLUMN `hardware_id` VARCHAR(100) NOT NULL,
    MODIFY COLUMN `display_name` VARCHAR(100) NOT NULL;

ALTER TABLE `map_layer`
    MODIFY COLUMN `name` VARCHAR(100) NOT NULL;

ALTER TABLE `session`
    MODIFY COLUMN `token_hash` VARCHAR(64) NOT NULL;

ALTER TABLE `password_reset_token`
    MODIFY COLUMN `token_hash` VARCHAR(64) NOT NULL;

ALTER TABLE `email_delivery`
    MODIFY COLUMN `to_email` VARCHAR(254) NOT NULL,
    MODIFY COLUMN `subject` VARCHAR(200) NOT NULL,
    MODIFY COLUMN `provider` VARCHAR(32) NOT NULL,
    MODIFY COLUMN `provider_id` VARCHAR(255) NULL,
    MODIFY COLUMN `error` TEXT NULL;

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

-- ---------------------------------------------------------------------------
-- Legacy per-entity settings are now represented by region columns. Keep the
-- global safetyTimeout document and all other system_setting rows.
-- ---------------------------------------------------------------------------
DELETE FROM `system_setting`
WHERE `key` LIKE 'region_settings:%'
   OR `key` LIKE 'safetyTimeout:%';

-- Session hardening: idle + absolute expiry, request metadata for audit.
ALTER TABLE `session`
    ADD COLUMN `absolute_expires_at` DATETIME(3) NULL,
    ADD COLUMN `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `ip_address` VARCHAR(64) NULL,
    ADD COLUMN `user_agent` VARCHAR(512) NULL;

CREATE INDEX `session_absolute_expires_at_idx` ON `session`(`absolute_expires_at`);
CREATE INDEX `session_last_seen_at_idx` ON `session`(`last_seen_at`);

-- Persistent login throttling (works across processes/replicas).
CREATE TABLE `login_throttle` (
    `key` VARCHAR(128) NOT NULL,
    `failures` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 0,
    `cooldown_until` DATETIME(3) NULL,
    `last_event_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `login_throttle_last_event_at_idx`(`last_event_at`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Query-pattern indexes for dashboards, history, and audit views.
CREATE INDEX `sprayer_block_id_is_active_idx` ON `sprayer`(`block_id`, `is_active`);
CREATE INDEX `sensor_reading_recorded_at_idx` ON `sensor_reading`(`recorded_at`);
CREATE INDEX `irrigation_event_started_at_idx` ON `irrigation_event`(`started_at`);
CREATE INDEX `irrigation_event_block_id_relay_started_at_idx` ON `irrigation_event`(`block_id`, `relay`, `started_at`);
CREATE INDEX `irrigation_event_sprayer_id_relay_ended_at_idx` ON `irrigation_event`(`sprayer_id`, `relay`, `ended_at`);
CREATE INDEX `irrigation_event_mode_started_at_idx` ON `irrigation_event`(`mode`, `started_at`);
CREATE INDEX `activity_log_created_at_idx` ON `activity_log`(`created_at`);
CREATE INDEX `activity_log_entity_type_created_at_idx` ON `activity_log`(`entity_type`, `created_at`);
CREATE INDEX `contact_submission_is_read_created_at_idx` ON `contact_submission`(`is_read`, `created_at`);
CREATE INDEX `email_delivery_created_at_idx` ON `email_delivery`(`created_at`);

-- Idempotent Firebase ingestion: one reading per sprayer timestamp.
-- Deduplicate legacy rows before enforcing the constraint.
DELETE older
FROM `sensor_reading` older
INNER JOIN `sensor_reading` newer
    ON older.`sprayer_id` = newer.`sprayer_id`
   AND older.`recorded_at` = newer.`recorded_at`
   AND older.`id` > newer.`id`;

CREATE UNIQUE INDEX `sensor_reading_sprayer_id_recorded_at_key`
    ON `sensor_reading`(`sprayer_id`, `recorded_at`);

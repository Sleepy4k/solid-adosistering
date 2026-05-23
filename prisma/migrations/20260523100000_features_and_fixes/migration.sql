-- Migration: features_and_fixes
-- A1: Volume divider per Region (raw Firebase value / divider = liters)
-- B1: Widget toggles per Region (show/hide wind direction & auto irrigation)
-- D2: Contact submission table

ALTER TABLE `region`
  ADD COLUMN `volume_divider`      DECIMAL(10,4) NOT NULL DEFAULT 1.0000 AFTER `longitude`,
  ADD COLUMN `show_wind_direction` BOOLEAN       NOT NULL DEFAULT TRUE    AFTER `volume_divider`,
  ADD COLUMN `show_auto_irrigation` BOOLEAN      NOT NULL DEFAULT TRUE    AFTER `show_wind_direction`;

CREATE TABLE `contact_submission` (
  `id`         VARCHAR(191)  NOT NULL,
  `name`       VARCHAR(191)  NOT NULL,
  `email`      VARCHAR(191)  NOT NULL,
  `phone`      VARCHAR(191)  NULL,
  `user_type`  VARCHAR(191)  NULL,
  `message`    TEXT          NOT NULL,
  `is_read`    BOOLEAN       NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `contact_submission_created_at_idx` (`created_at`),
  INDEX `contact_submission_is_read_idx`    (`is_read`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

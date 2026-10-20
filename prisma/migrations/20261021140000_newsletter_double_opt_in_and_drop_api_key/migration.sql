-- Newsletter double opt-in lifecycle.
--
-- Order matters: every new column is added before the legacy `is_active`
-- column is dropped, and all existing subscribers are backfilled from the
-- legacy boolean so the migration is strictly data-preserving.
ALTER TABLE `newsletter_subscriber`
    ADD COLUMN `status` ENUM('PENDING', 'CONFIRMED', 'UNSUBSCRIBED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `confirmed_at` DATETIME(3) NULL,
    ADD COLUMN `confirmation_token_hash` VARCHAR(64) NULL,
    ADD COLUMN `confirmation_expires_at` DATETIME(3) NULL,
    ADD COLUMN `last_confirmation_sent_at` DATETIME(3) NULL,
    ADD COLUMN `consent_source` VARCHAR(64) NULL;

UPDATE `newsletter_subscriber`
SET
    `status` = CASE
        WHEN `is_active` = 1 THEN 'CONFIRMED'
        ELSE 'UNSUBSCRIBED'
    END,
    `confirmed_at` = CASE
        WHEN `is_active` = 1 THEN `subscribed_at`
        ELSE NULL
    END,
    `unsubscribed_at` = CASE
        WHEN `is_active` = 0 THEN COALESCE(`unsubscribed_at`, `subscribed_at`)
        ELSE `unsubscribed_at`
    END,
    `consent_source` = 'LEGACY_IMPORT';

DROP INDEX `newsletter_subscriber_is_active_subscribed_at_idx` ON `newsletter_subscriber`;
ALTER TABLE `newsletter_subscriber` DROP COLUMN `is_active`;

CREATE INDEX `newsletter_subscriber_status_subscribed_at_idx` ON `newsletter_subscriber`(`status`, `subscribed_at`);
CREATE INDEX `newsletter_subscriber_confirmation_expires_at_idx` ON `newsletter_subscriber`(`confirmation_expires_at`);
CREATE INDEX `newsletter_subscriber_confirmation_token_hash_idx` ON `newsletter_subscriber`(`confirmation_token_hash`);

-- `user_detail.api_key` has no remaining consumers and holds dead data only.
-- Dropping the column also removes its unique index.
DROP INDEX `user_detail_api_key_key` ON `user_detail`;
ALTER TABLE `user_detail` DROP COLUMN `api_key`;

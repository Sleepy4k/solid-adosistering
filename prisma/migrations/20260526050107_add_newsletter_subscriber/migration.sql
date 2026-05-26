-- CreateTable
CREATE TABLE `newsletter_subscriber` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `subscribed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `unsubscribed_at` DATETIME(3) NULL,

    UNIQUE INDEX `newsletter_subscriber_email_key`(`email`),
    INDEX `newsletter_subscriber_is_active_subscribed_at_idx`(`is_active`, `subscribed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

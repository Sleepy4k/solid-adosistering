-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPERADMIN', 'ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    INDEX `user_role_created_at_idx`(`role`, `created_at`),
    INDEX `user_is_active_created_at_idx`(`is_active`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `session_token_hash_key`(`token_hash`),
    INDEX `session_user_id_idx`(`user_id`),
    INDEX `session_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_token` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_token_token_hash_key`(`token_hash`),
    INDEX `password_reset_token_user_id_idx`(`user_id`),
    INDEX `password_reset_token_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `region` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `latitude` DECIMAL(18, 16) NULL,
    `longitude` DECIMAL(19, 16) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `updated_by_id` VARCHAR(191) NULL,
    `firebase_sync_status` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `firebase_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `region_name_key`(`name`),
    INDEX `region_created_by_id_idx`(`created_by_id`),
    INDEX `region_firebase_sync_status_created_at_idx`(`firebase_sync_status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `block` (
    `id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `area_hectare` DECIMAL(10, 2) NULL,
    `polygon_geojson` JSON NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `updated_by_id` VARCHAR(191) NULL,
    `firebase_sync_status` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `firebase_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `block_created_by_id_idx`(`created_by_id`),
    UNIQUE INDEX `block_region_id_name_key`(`region_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sprayer` (
    `id` VARCHAR(191) NOT NULL,
    `block_id` VARCHAR(191) NOT NULL,
    `hardware_id` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `installed_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `firebase_sync_status` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `firebase_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sprayer_block_id_idx`(`block_id`),
    UNIQUE INDEX `sprayer_block_id_hardware_id_key`(`block_id`, `hardware_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_region_assignment` (
    `admin_id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NOT NULL,
    `assigned_by_id` VARCHAR(191) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_region_assignment_region_id_idx`(`region_id`),
    INDEX `admin_region_assignment_assigned_by_id_idx`(`assigned_by_id`),
    PRIMARY KEY (`admin_id`, `region_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_region_assignment` (
    `user_id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NOT NULL,
    `assigned_by_id` VARCHAR(191) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_region_assignment_region_id_idx`(`region_id`),
    INDEX `user_region_assignment_assigned_by_id_idx`(`assigned_by_id`),
    PRIMARY KEY (`user_id`, `region_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `indicator_threshold` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NOT NULL,
    `dry_max_percent` INTEGER NOT NULL,
    `wet_min_percent` INTEGER NOT NULL,
    `display_dry_max_percent` INTEGER NOT NULL DEFAULT 40,
    `display_moist_max_percent` INTEGER NOT NULL DEFAULT 70,
    `display_wet_min_percent` INTEGER NOT NULL DEFAULT 80,
    `land_preference` ENUM('KERING', 'LEMBAB', 'BASAH') NOT NULL DEFAULT 'LEMBAB',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `indicator_threshold_region_id_idx`(`region_id`),
    UNIQUE INDEX `indicator_threshold_user_id_region_id_key`(`user_id`, `region_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_reading` (
    `id` VARCHAR(191) NOT NULL,
    `block_id` VARCHAR(191) NOT NULL,
    `sprayer_id` VARCHAR(191) NOT NULL,
    `moisture_percent` DECIMAL(5, 2) NOT NULL,
    `flow_lmin` DECIMAL(8, 2) NOT NULL,
    `total_volume_liter` DECIMAL(12, 2) NULL,
    `moisture_status` ENUM('KERING', 'LEMBAB', 'BASAH') NOT NULL,
    `pump_status` VARCHAR(191) NOT NULL,
    `wind_direction` VARCHAR(191) NULL,
    `recorded_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sensor_reading_block_id_recorded_at_idx`(`block_id`, `recorded_at`),
    INDEX `sensor_reading_sprayer_id_recorded_at_idx`(`sprayer_id`, `recorded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `irrigation_event` (
    `id` VARCHAR(191) NOT NULL,
    `block_id` VARCHAR(191) NOT NULL,
    `sprayer_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `mode` ENUM('AUTO', 'MANUAL') NOT NULL,
    `relay` ENUM('OFF', 'ON') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `duration_seconds` INTEGER NULL,
    `total_volume_liter` DECIMAL(12, 2) NULL,
    `firebase_event_id` VARCHAR(191) NULL,
    `firebase_date_key` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NOT NULL,
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `irrigation_event_firebase_event_id_key`(`firebase_event_id`),
    INDEX `irrigation_event_block_id_started_at_idx`(`block_id`, `started_at`),
    INDEX `irrigation_event_sprayer_id_started_at_idx`(`sprayer_id`, `started_at`),
    INDEX `irrigation_event_actor_id_idx`(`actor_id`),
    INDEX `irrigation_event_firebase_date_key_idx`(`firebase_date_key`),
    INDEX `irrigation_event_firebase_event_id_idx`(`firebase_event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `map_layer` (
    `id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `geojson` JSON NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `map_layer_region_id_name_key`(`region_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_log` (
    `id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `block_id` VARCHAR(191) NULL,
    `action` ENUM('AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_PASSWORD_RESET_REQUEST', 'AUTH_PASSWORD_RESET_COMPLETE', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'UNASSIGN', 'CONTROL_OVERRIDE', 'FIREBASE_SYNC', 'ALERT_SENT') NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_log_actor_id_created_at_idx`(`actor_id`, `created_at`),
    INDEX `activity_log_region_id_created_at_idx`(`region_id`, `created_at`),
    INDEX `activity_log_action_created_at_idx`(`action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alert_notification` (
    `id` VARCHAR(191) NOT NULL,
    `recipient_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `block_id` VARCHAR(191) NULL,
    `sprayer_id` VARCHAR(191) NULL,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `delivered_at` DATETIME(3) NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `alert_notification_recipient_id_created_at_idx`(`recipient_id`, `created_at`),
    INDEX `alert_notification_severity_created_at_idx`(`severity`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_delivery` (
    `id` VARCHAR(191) NOT NULL,
    `recipient_id` VARCHAR(191) NULL,
    `to_email` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_id` VARCHAR(191) NULL,
    `sent_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_delivery_recipient_id_created_at_idx`(`recipient_id`, `created_at`),
    INDEX `email_delivery_to_email_created_at_idx`(`to_email`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_detail` (
    `user_id` VARCHAR(191) NOT NULL,
    `whatsapp` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NULL,
    `birth_date` DATETIME(3) NULL,
    `alt_phone` VARCHAR(191) NULL,
    `occupation` VARCHAR(191) NULL,
    `domicile` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `province` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `postal_code` VARCHAR(191) NULL,
    `internal_notes` TEXT NULL,
    `device_username` VARCHAR(191) NULL,
    `api_key` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_detail_device_username_key`(`device_username`),
    UNIQUE INDEX `user_detail_api_key_key`(`api_key`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_token` ADD CONSTRAINT `password_reset_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `region` ADD CONSTRAINT `region_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `region` ADD CONSTRAINT `region_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `block` ADD CONSTRAINT `block_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `block` ADD CONSTRAINT `block_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `block` ADD CONSTRAINT `block_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sprayer` ADD CONSTRAINT `sprayer_block_id_fkey` FOREIGN KEY (`block_id`) REFERENCES `block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_region_assignment` ADD CONSTRAINT `admin_region_assignment_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_region_assignment` ADD CONSTRAINT `admin_region_assignment_assigned_by_id_fkey` FOREIGN KEY (`assigned_by_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_region_assignment` ADD CONSTRAINT `admin_region_assignment_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_region_assignment` ADD CONSTRAINT `user_region_assignment_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_region_assignment` ADD CONSTRAINT `user_region_assignment_assigned_by_id_fkey` FOREIGN KEY (`assigned_by_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_region_assignment` ADD CONSTRAINT `user_region_assignment_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `indicator_threshold` ADD CONSTRAINT `indicator_threshold_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `indicator_threshold` ADD CONSTRAINT `indicator_threshold_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_reading` ADD CONSTRAINT `sensor_reading_block_id_fkey` FOREIGN KEY (`block_id`) REFERENCES `block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_reading` ADD CONSTRAINT `sensor_reading_sprayer_id_fkey` FOREIGN KEY (`sprayer_id`) REFERENCES `sprayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `irrigation_event` ADD CONSTRAINT `irrigation_event_block_id_fkey` FOREIGN KEY (`block_id`) REFERENCES `block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `irrigation_event` ADD CONSTRAINT `irrigation_event_sprayer_id_fkey` FOREIGN KEY (`sprayer_id`) REFERENCES `sprayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `irrigation_event` ADD CONSTRAINT `irrigation_event_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `map_layer` ADD CONSTRAINT `map_layer_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_block_id_fkey` FOREIGN KEY (`block_id`) REFERENCES `block`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_notification` ADD CONSTRAINT `alert_notification_recipient_id_fkey` FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_notification` ADD CONSTRAINT `alert_notification_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_notification` ADD CONSTRAINT `alert_notification_block_id_fkey` FOREIGN KEY (`block_id`) REFERENCES `block`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_notification` ADD CONSTRAINT `alert_notification_sprayer_id_fkey` FOREIGN KEY (`sprayer_id`) REFERENCES `sprayer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_delivery` ADD CONSTRAINT `email_delivery_recipient_id_fkey` FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_detail` ADD CONSTRAINT `user_detail_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

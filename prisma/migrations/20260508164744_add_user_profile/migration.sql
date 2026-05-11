-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPERADMIN', 'ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Region` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `firebaseSyncStatus` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `firebaseSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Region_name_key`(`name`),
    INDEX `Region_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Block` (
    `id` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `areaHectare` DECIMAL(10, 2) NULL,
    `polygonGeojson` JSON NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `firebaseSyncStatus` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `firebaseSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Block_createdById_idx`(`createdById`),
    UNIQUE INDEX `Block_regionId_name_key`(`regionId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sprayer` (
    `id` VARCHAR(191) NOT NULL,
    `blockId` VARCHAR(191) NOT NULL,
    `hardwareId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `installedAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `firebaseSyncStatus` ENUM('PENDING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `firebaseSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Sprayer_hardwareId_key`(`hardwareId`),
    INDEX `Sprayer_blockId_idx`(`blockId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminRegionAssignment` (
    `adminId` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminRegionAssignment_regionId_idx`(`regionId`),
    INDEX `AdminRegionAssignment_assignedById_idx`(`assignedById`),
    PRIMARY KEY (`adminId`, `regionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRegionAssignment` (
    `userId` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserRegionAssignment_regionId_idx`(`regionId`),
    INDEX `UserRegionAssignment_assignedById_idx`(`assignedById`),
    PRIMARY KEY (`userId`, `regionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserBlockAssignment` (
    `userId` VARCHAR(191) NOT NULL,
    `blockId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserBlockAssignment_blockId_idx`(`blockId`),
    INDEX `UserBlockAssignment_assignedById_idx`(`assignedById`),
    PRIMARY KEY (`userId`, `blockId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSprayerAssignment` (
    `userId` VARCHAR(191) NOT NULL,
    `sprayerId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserSprayerAssignment_sprayerId_idx`(`sprayerId`),
    INDEX `UserSprayerAssignment_assignedById_idx`(`assignedById`),
    PRIMARY KEY (`userId`, `sprayerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndicatorThreshold` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `blockId` VARCHAR(191) NOT NULL,
    `dryMaxPercent` INTEGER NOT NULL,
    `wetMinPercent` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IndicatorThreshold_blockId_idx`(`blockId`),
    UNIQUE INDEX `IndicatorThreshold_userId_blockId_key`(`userId`, `blockId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SensorReading` (
    `id` VARCHAR(191) NOT NULL,
    `blockId` VARCHAR(191) NOT NULL,
    `sprayerId` VARCHAR(191) NOT NULL,
    `moisturePercent` DECIMAL(5, 2) NOT NULL,
    `flowLmin` DECIMAL(8, 2) NOT NULL,
    `moistureStatus` ENUM('KERING', 'LEMBAB', 'BASAH') NOT NULL,
    `pumpStatus` VARCHAR(191) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SensorReading_blockId_recordedAt_idx`(`blockId`, `recordedAt`),
    INDEX `SensorReading_sprayerId_recordedAt_idx`(`sprayerId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IrrigationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `blockId` VARCHAR(191) NOT NULL,
    `sprayerId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `mode` ENUM('AUTO', 'MANUAL') NOT NULL,
    `relay` ENUM('OFF', 'ON') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IrrigationEvent_blockId_startedAt_idx`(`blockId`, `startedAt`),
    INDEX `IrrigationEvent_sprayerId_startedAt_idx`(`sprayerId`, `startedAt`),
    INDEX `IrrigationEvent_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapLayer` (
    `id` VARCHAR(191) NOT NULL,
    `regionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `geojson` JSON NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MapLayer_regionId_name_key`(`regionId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `regionId` VARCHAR(191) NULL,
    `blockId` VARCHAR(191) NULL,
    `action` ENUM('AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_PASSWORD_RESET_REQUEST', 'AUTH_PASSWORD_RESET_COMPLETE', 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'UNASSIGN', 'CONTROL_OVERRIDE', 'FIREBASE_SYNC', 'ALERT_SENT') NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `ActivityLog_regionId_createdAt_idx`(`regionId`, `createdAt`),
    INDEX `ActivityLog_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertNotification` (
    `id` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NULL,
    `regionId` VARCHAR(191) NULL,
    `blockId` VARCHAR(191) NULL,
    `sprayerId` VARCHAR(191) NULL,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `deliveredAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AlertNotification_recipientId_createdAt_idx`(`recipientId`, `createdAt`),
    INDEX `AlertNotification_severity_createdAt_idx`(`severity`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NULL,
    `toEmail` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmailDelivery_recipientId_createdAt_idx`(`recipientId`, `createdAt`),
    INDEX `EmailDelivery_toEmail_createdAt_idx`(`toEmail`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserProfile` (
    `userId` VARCHAR(191) NOT NULL,
    `whatsapp` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NULL,
    `birthDate` DATETIME(3) NULL,
    `altPhone` VARCHAR(191) NULL,
    `occupation` VARCHAR(191) NULL,
    `domicile` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `province` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `postalCode` VARCHAR(191) NULL,
    `internalNotes` TEXT NULL,
    `deviceUsername` VARCHAR(191) NULL,
    `apiKey` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserProfile_deviceUsername_key`(`deviceUsername`),
    UNIQUE INDEX `UserProfile_apiKey_key`(`apiKey`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Region` ADD CONSTRAINT `Region_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Region` ADD CONSTRAINT `Region_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Block` ADD CONSTRAINT `Block_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Block` ADD CONSTRAINT `Block_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Block` ADD CONSTRAINT `Block_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sprayer` ADD CONSTRAINT `Sprayer_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminRegionAssignment` ADD CONSTRAINT `AdminRegionAssignment_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminRegionAssignment` ADD CONSTRAINT `AdminRegionAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminRegionAssignment` ADD CONSTRAINT `AdminRegionAssignment_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRegionAssignment` ADD CONSTRAINT `UserRegionAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRegionAssignment` ADD CONSTRAINT `UserRegionAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRegionAssignment` ADD CONSTRAINT `UserRegionAssignment_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBlockAssignment` ADD CONSTRAINT `UserBlockAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBlockAssignment` ADD CONSTRAINT `UserBlockAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserBlockAssignment` ADD CONSTRAINT `UserBlockAssignment_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSprayerAssignment` ADD CONSTRAINT `UserSprayerAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSprayerAssignment` ADD CONSTRAINT `UserSprayerAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSprayerAssignment` ADD CONSTRAINT `UserSprayerAssignment_sprayerId_fkey` FOREIGN KEY (`sprayerId`) REFERENCES `Sprayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IndicatorThreshold` ADD CONSTRAINT `IndicatorThreshold_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IndicatorThreshold` ADD CONSTRAINT `IndicatorThreshold_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SensorReading` ADD CONSTRAINT `SensorReading_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SensorReading` ADD CONSTRAINT `SensorReading_sprayerId_fkey` FOREIGN KEY (`sprayerId`) REFERENCES `Sprayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IrrigationEvent` ADD CONSTRAINT `IrrigationEvent_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IrrigationEvent` ADD CONSTRAINT `IrrigationEvent_sprayerId_fkey` FOREIGN KEY (`sprayerId`) REFERENCES `Sprayer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IrrigationEvent` ADD CONSTRAINT `IrrigationEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapLayer` ADD CONSTRAINT `MapLayer_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertNotification` ADD CONSTRAINT `AlertNotification_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertNotification` ADD CONSTRAINT `AlertNotification_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertNotification` ADD CONSTRAINT `AlertNotification_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `Block`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertNotification` ADD CONSTRAINT `AlertNotification_sprayerId_fkey` FOREIGN KEY (`sprayerId`) REFERENCES `Sprayer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailDelivery` ADD CONSTRAINT `EmailDelivery_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProfile` ADD CONSTRAINT `UserProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

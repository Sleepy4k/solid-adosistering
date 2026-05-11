import "dotenv/config";
import { ActivityAction, IrrigationMode, MoistureStatus, RelayState, Role, SyncStatus } from "@prisma/client";
import { prisma } from "../src/server/prisma";
import { hashPassword } from "../src/server/security";

// ─── Seed data — no .env dependency ─────────────────────────────────────────

const USERS = [
  { email: "superadmin@test.com", name: "Super Administrator", password: "Admin@12345", role: Role.SUPERADMIN },
  { email: "admin.barat@test.com", name: "Admin Wilayah Barat", password: "Admin@12345", role: Role.ADMIN },
  { email: "admin.timur@test.com", name: "Admin Wilayah Timur", password: "Admin@12345", role: Role.ADMIN },
  { email: "petani.satu@test.com", name: "Budi Santoso", password: "User@12345", role: Role.USER },
  { email: "petani.dua@test.com", name: "Siti Rahayu", password: "User@12345", role: Role.USER },
  { email: "petani.tiga@test.com", name: "Ahmad Fauzi", password: "User@12345", role: Role.USER },
] as const;

const PROFILES: Record<string, { whatsapp?: string; gender?: string; occupation?: string; city?: string; province?: string; country?: string }> = {
  "superadmin@test.com": { whatsapp: "081200000001", gender: "Laki-laki", occupation: "System Administrator", city: "Jakarta", province: "DKI Jakarta", country: "Indonesia" },
  "admin.barat@test.com": { whatsapp: "081200000002", gender: "Laki-laki", occupation: "Farm Manager", city: "Bandung", province: "Jawa Barat", country: "Indonesia" },
  "admin.timur@test.com": { whatsapp: "081200000003", gender: "Perempuan", occupation: "Farm Manager", city: "Surabaya", province: "Jawa Timur", country: "Indonesia" },
  "petani.satu@test.com": { whatsapp: "081200000004", gender: "Laki-laki", occupation: "Petani", city: "Cimahi", province: "Jawa Barat", country: "Indonesia" },
  "petani.dua@test.com": { whatsapp: "081200000005", gender: "Perempuan", occupation: "Petani", city: "Cimahi", province: "Jawa Barat", country: "Indonesia" },
  "petani.tiga@test.com": { whatsapp: "081200000006", gender: "Laki-laki", occupation: "Petani", city: "Cimahi", province: "Jawa Barat", country: "Indonesia" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number, hour = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function randFloat(min: number, max: number, dp = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding database…");

  // ── 1. Users ────────────────────────────────────────────────────────────────
  const userMap: Record<string, string> = {};
  for (const u of USERS) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, isActive: true },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: await hashPassword(u.password),
        role: u.role,
        isActive: true,
      },
    });
    userMap[u.email] = created.id;

    const prof = PROFILES[u.email];
    if (prof) {
      await prisma.userProfile.upsert({
        where: { userId: created.id },
        update: prof,
        create: { userId: created.id, ...prof },
      });
    }
  }

  const SA = userMap["superadmin@test.com"];
  const AB = userMap["admin.barat@test.com"];
  const AT = userMap["admin.timur@test.com"];
  const U1 = userMap["petani.satu@test.com"];
  const U2 = userMap["petani.dua@test.com"];
  const U3 = userMap["petani.tiga@test.com"];

  // ── 2. Regions ──────────────────────────────────────────────────────────────
  const regionBarat = await prisma.region.upsert({
    where: { name: "Wilayah Barat" },
    update: {},
    create: {
      name: "Wilayah Barat",
      description: "Kawasan pertanian di wilayah barat",
      latitude: -6.9175,
      longitude: 107.6191,
      createdById: SA,
      firebaseSyncStatus: SyncStatus.SYNCED,
      firebaseSyncedAt: new Date(),
    },
  });

  const regionTimur = await prisma.region.upsert({
    where: { name: "Wilayah Timur" },
    update: {},
    create: {
      name: "Wilayah Timur",
      description: "Kawasan pertanian di wilayah timur",
      latitude: -7.2575,
      longitude: 112.7521,
      createdById: SA,
      firebaseSyncStatus: SyncStatus.SYNCED,
      firebaseSyncedAt: new Date(),
    },
  });

  // ── 3. Admin → Region assignments ───────────────────────────────────────────
  await prisma.adminRegionAssignment.upsert({
    where: { adminId_regionId: { adminId: AB, regionId: regionBarat.id } },
    update: {},
    create: { adminId: AB, regionId: regionBarat.id, assignedById: SA },
  });
  await prisma.adminRegionAssignment.upsert({
    where: { adminId_regionId: { adminId: AT, regionId: regionTimur.id } },
    update: {},
    create: { adminId: AT, regionId: regionTimur.id, assignedById: SA },
  });

  // ── 4. Blocks ────────────────────────────────────────────────────────────────
  const blokA1 = await prisma.block.upsert({
    where: { regionId_name: { regionId: regionBarat.id, name: "Blok A-1" } },
    update: {},
    create: { regionId: regionBarat.id, name: "Blok A-1", areaHectare: 2.5, createdById: AB, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });
  const blokA2 = await prisma.block.upsert({
    where: { regionId_name: { regionId: regionBarat.id, name: "Blok A-2" } },
    update: {},
    create: { regionId: regionBarat.id, name: "Blok A-2", areaHectare: 1.8, createdById: AB, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });
  const blokT1 = await prisma.block.upsert({
    where: { regionId_name: { regionId: regionTimur.id, name: "Blok T-1" } },
    update: {},
    create: { regionId: regionTimur.id, name: "Blok T-1", areaHectare: 3.0, createdById: AT, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });
  const blokT2 = await prisma.block.upsert({
    where: { regionId_name: { regionId: regionTimur.id, name: "Blok T-2" } },
    update: {},
    create: { regionId: regionTimur.id, name: "Blok T-2", areaHectare: 2.2, createdById: AT, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });

  // ── 5. Sprayers ──────────────────────────────────────────────────────────────
  const sprA1 = await prisma.sprayer.upsert({
    where: { hardwareId: "SPR-A1-001" },
    update: {},
    create: { blockId: blokA1.id, hardwareId: "SPR-A1-001", displayName: "Sprayer Blok A-1", isActive: true, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });
  const sprA2 = await prisma.sprayer.upsert({
    where: { hardwareId: "SPR-A2-001" },
    update: {},
    create: { blockId: blokA2.id, hardwareId: "SPR-A2-001", displayName: "Sprayer Blok A-2", isActive: true, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });
  const sprT1 = await prisma.sprayer.upsert({
    where: { hardwareId: "SPR-T1-001" },
    update: {},
    create: { blockId: blokT1.id, hardwareId: "SPR-T1-001", displayName: "Sprayer Blok T-1", isActive: true, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });
  const sprT2 = await prisma.sprayer.upsert({
    where: { hardwareId: "SPR-T2-001" },
    update: {},
    create: { blockId: blokT2.id, hardwareId: "SPR-T2-001", displayName: "Sprayer Blok T-2", isActive: true, firebaseSyncStatus: SyncStatus.SYNCED, firebaseSyncedAt: new Date() },
  });

  // ── 6. User → Block assignments ──────────────────────────────────────────────
  const blockAssignments = [
    { userId: U1, blockId: blokA1.id },
    { userId: U2, blockId: blokA1.id },
    { userId: U3, blockId: blokA2.id },
  ];
  for (const a of blockAssignments) {
    await prisma.userBlockAssignment.upsert({
      where: { userId_blockId: { userId: a.userId, blockId: a.blockId } },
      update: {},
      create: { userId: a.userId, blockId: a.blockId, assignedById: AB },
    });
  }

  // ── 7. Indicator thresholds (per user+block) ─────────────────────────────────
  await prisma.indicatorThreshold.upsert({
    where: { userId_blockId: { userId: U1, blockId: blokA1.id } },
    update: {},
    create: { userId: U1, blockId: blokA1.id, dryMaxPercent: 40, wetMinPercent: 75 },
  });
  await prisma.indicatorThreshold.upsert({
    where: { userId_blockId: { userId: U2, blockId: blokA1.id } },
    update: {},
    create: { userId: U2, blockId: blokA1.id, dryMaxPercent: 35, wetMinPercent: 70 },
  });
  await prisma.indicatorThreshold.upsert({
    where: { userId_blockId: { userId: U3, blockId: blokA2.id } },
    update: {},
    create: { userId: U3, blockId: blokA2.id, dryMaxPercent: 40, wetMinPercent: 80 },
  });

  // ── 8. System settings ───────────────────────────────────────────────────────
  await prisma.systemSetting.upsert({
    where: { key: "safetyTimeout" },
    update: {},
    create: { key: "safetyTimeout", value: { min: 2, max: 15 } },
  });
  await prisma.systemSetting.upsert({
    where: { key: "mapConfig" },
    update: {},
    create: { key: "mapConfig", value: { lat: -6.9175, lng: 107.6191, zoom: 12 } },
  });

  // ── 9. Demo sensor readings (last 7 days) ───────────────────────────────────
  const readingPairs = [
    { blockId: blokA1.id, sprayerId: sprA1.id },
    { blockId: blokA2.id, sprayerId: sprA2.id },
    { blockId: blokT1.id, sprayerId: sprT1.id },
    { blockId: blokT2.id, sprayerId: sprT2.id },
  ];

  const existingReadings = await prisma.sensorReading.count();
  if (existingReadings === 0) {
    const readingData = [];
    for (let day = 6; day >= 0; day--) {
      for (let hour = 0; hour < 24; hour += 2) {
        for (const pair of readingPairs) {
          const moisture = randFloat(30, 85);
          let status: MoistureStatus;
          if (moisture <= 40) status = MoistureStatus.KERING;
          else if (moisture >= 70) status = MoistureStatus.BASAH;
          else status = MoistureStatus.LEMBAB;
          readingData.push({
            blockId: pair.blockId,
            sprayerId: pair.sprayerId,
            moisturePercent: moisture,
            flowLmin: moisture < 40 ? randFloat(0.5, 2.0) : 0,
            moistureStatus: status,
            pumpStatus: moisture < 40 ? "ON" : "OFF",
            recordedAt: daysAgo(day, hour),
          });
        }
      }
    }
    await prisma.sensorReading.createMany({ data: readingData });
    console.log(`   ✓ Created ${readingData.length} sensor readings`);
  }

  // ── 10. Demo irrigation events (last 7 days) ─────────────────────────────────
  const existingEvents = await prisma.irrigationEvent.count();
  if (existingEvents === 0) {
    const eventData = [];
    for (let day = 6; day >= 0; day--) {
      for (const pair of readingPairs) {
        const start = daysAgo(day, 8);
        const end = new Date(start.getTime() + 30 * 60_000);
        eventData.push({
          blockId: pair.blockId,
          sprayerId: pair.sprayerId,
          actorId: null,
          mode: IrrigationMode.AUTO,
          relay: RelayState.ON,
          reason: "Kelembaban di bawah ambang kering",
          startedAt: start,
          endedAt: end,
        });
      }
    }
    await prisma.irrigationEvent.createMany({ data: eventData });
    console.log(`   ✓ Created ${eventData.length} irrigation events`);
  }

  // ── 11. Seed version marker ──────────────────────────────────────────────────
  await prisma.systemSetting.upsert({
    where: { key: "seed.version" },
    update: { value: { version: 2, seededAt: new Date().toISOString() } },
    create: { key: "seed.version", value: { version: 2, seededAt: new Date().toISOString() } },
  });

  // ── 12. Activity log ─────────────────────────────────────────────────────────
  await prisma.activityLog.create({
    data: {
      actorId: SA,
      action: ActivityAction.CREATE,
      entityType: "Seed",
      metadata: { users: Object.keys(userMap), version: 2 },
    },
  });

  console.log("\n✅ Seed complete!");
  console.log("   Credentials (all passwords are role-prefixed + @12345):");
  console.log("   superadmin@test.com   Admin@12345  (SUPERADMIN)");
  console.log("   admin.barat@test.com  Admin@12345  (ADMIN - Wilayah Barat)");
  console.log("   admin.timur@test.com  Admin@12345  (ADMIN - Wilayah Timur)");
  console.log("   petani.satu@test.com  User@12345   (USER - Blok A-1)");
  console.log("   petani.dua@test.com   User@12345   (USER - Blok A-1)");
  console.log("   petani.tiga@test.com  User@12345   (USER - Blok A-2)");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

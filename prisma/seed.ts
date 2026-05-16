import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ActivityAction, IrrigationMode, MoistureStatus, RelayState, Role, SyncStatus } from "@prisma/client";
import { prisma } from "../src/server/db/prisma";
import { hashPassword } from "../src/server/security";

type FirebaseHistoryEntry = {
  duration?: number;
  endtime?: number;
  flow_Lmin?: number;
  mode?: "AUTO" | "MANUAL";
  moisture_percent?: number;
  moisture_status?: string;
  pump_status?: boolean;
  starttime?: number;
  timestamp?: number;
  totalVolume?: number;
};

type FirebaseSprayer = {
  control?: {
    mode?: "AUTO" | "MANUAL";
    pump_status?: boolean;
  };
  history?: Record<string, Record<string, FirebaseHistoryEntry>>;
  live_data?: {
    arah_angin?: string;
    flow_Lmin?: number;
    last_updated?: number;
    moisture_percent?: number;
    moisture_status?: string;
    totalVolume?: number;
  };
};

type FirebaseRegion = {
  blocks?: Record<string, Record<string, FirebaseSprayer>>;
  region_settings?: {
    batas_basah?: number;
    batas_kering?: number;
    mode_otomatis?: boolean;
  };
};

const MAOS_BLOCK_POLYGONS: Record<string, number[][][]> = {
  Block_A: [
    [
      [109.1770180391451, -7.611662588770801],
      [109.1772718588196, -7.611729371676888],
      [109.1773138564573, -7.611522537438425],
      [109.1772481058166, -7.611412152719807],
      [109.1770733422873, -7.611382800759136],
      [109.1770180391451, -7.611662588770801],
    ],
  ],
  Block_B: [
    [
      [109.1773382311982, -7.611529918847196],
      [109.1773100379775, -7.61170700918951],
      [109.1774200977916, -7.611728833647379],
      [109.1774252274762, -7.611722775822041],
      [109.1774900865127, -7.611730103182391],
      [109.1775003776433, -7.611748712058586],
      [109.177563912328, -7.611761530138399],
      [109.177599134858, -7.611483350476971],
      [109.1775636214101, -7.611443940555987],
      [109.1775160944775, -7.611416915196883],
      [109.177507004757, -7.611458475765968],
      [109.1774781852585, -7.61149166282676],
      [109.1774404022836, -7.611518443018337],
      [109.1774175869552, -7.611538224332201],
      [109.1774015034744, -7.61152182631087],
      [109.1773382311982, -7.611529918847196],
    ],
  ],
  Block_C: [
    [
      [109.1774533818596, -7.611234549431889],
      [109.1774755766219, -7.611224757792614],
      [109.1775157885378, -7.611253819497154],
      [109.1775286545613, -7.611244716617641],
      [109.177543303334, -7.611269639766305],
      [109.1775295892026, -7.611279586889667],
      [109.177541035709, -7.611331551240225],
      [109.1775406991563, -7.611353035744744],
      [109.1775244945911, -7.611370458792687],
      [109.177518785603, -7.611409779751356],
      [109.1775614600524, -7.611432807857328],
      [109.1776013371555, -7.611475360446926],
      [109.1776289790622, -7.611225091694076],
      [109.1774308373339, -7.611191594565889],
      [109.1774533818596, -7.611234549431889],
    ],
  ],
  Block_D: [
    [
      [109.177253593713, -7.611411128434352],
      [109.1772299182996, -7.611368607887754],
      [109.1771882194883, -7.611286257485159],
      [109.1772003121131, -7.611254368377651],
      [109.1772152822509, -7.611228055591599],
      [109.1772004669203, -7.611211345240061],
      [109.1772173344564, -7.61119703272883],
      [109.1772377595028, -7.611193055324344],
      [109.1772575300389, -7.611211441160655],
      [109.1772931897031, -7.611206936098331],
      [109.1773355235233, -7.611229690368811],
      [109.1773568742888, -7.611211528355206],
      [109.1773954658454, -7.61124054957851],
      [109.1774479439706, -7.611237336870074],
      [109.1774203696532, -7.611192860052276],
      [109.1771186046217, -7.611147251523497],
      [109.1770752976294, -7.61138300684791],
      [109.1772462993457, -7.611415643558075],
      [109.177253593713, -7.611411128434352],
    ],
  ],
  Block_E: [
    [
      [109.1773236475781, -7.611487389962345],
      [109.1773353802701, -7.611414704625105],
      [109.1773199512356, -7.611378975135995],
      [109.1773466440741, -7.61134126882697],
      [109.177352438409, -7.611306931175222],
      [109.1773577380357, -7.611257500442664],
      [109.1772890172952, -7.611224578362393],
      [109.1772389355649, -7.611236751061838],
      [109.1772098940003, -7.611283428973325],
      [109.1773236475781, -7.611487389962345],
    ],
  ],
};

const USERS = [
  { email: "superadmin@test.com", name: "Super Administrator", password: "Password123!", role: Role.SUPERADMIN },
  { email: "admin@test.com", name: "Admin MAOS", password: "Password123!", role: Role.ADMIN },
  { email: "user@test.com", name: "User MAOS", password: "Password123!", role: Role.USER },
  {
    email: "kawistamaos@adosistering.labgo.id",
    name: "Kawista Maos",
    password: "mernek123",
    role: Role.USER,
  },
] as const;

const LEGACY_SEED_EMAILS = [
  "admin.maos@test.com",
  "petani.satu@test.com",
  "petani.dua@test.com",
  "petani.tiga@test.com",
];

const PROFILES: Record<
  string,
  {
    whatsapp?: string;
    gender?: string;
    occupation?: string;
    city?: string;
    province?: string;
    country?: string;
    domicile?: string;
    address?: string;
  }
> = {
  "superadmin@test.com": {
    whatsapp: "081200000001",
    gender: "Laki-laki",
    occupation: "System Administrator",
    city: "Jakarta",
    province: "DKI Jakarta",
    country: "Indonesia",
  },
  "admin@test.com": {
    whatsapp: "081200000002",
    gender: "Laki-laki",
    occupation: "Farm Manager",
    city: "Cilacap",
    province: "Jawa Tengah",
    country: "Indonesia",
    domicile: "Maos",
  },
  "user@test.com": {
    whatsapp: "081200000003",
    gender: "Laki-laki",
    occupation: "Petani",
    city: "Cilacap",
    province: "Jawa Tengah",
    country: "Indonesia",
    domicile: "Maos",
    address: "Desa Mernek",
  },
  "kawistamaos@adosistering.labgo.id": {
    whatsapp: "081200000004",
    gender: "Laki-laki",
    occupation: "Petani",
    city: "Cilacap",
    province: "Jawa Tengah",
    country: "Indonesia",
    domicile: "Maos",
    address: "Desa Mernek",
  },
};

function readFirebaseExample(): Record<string, FirebaseRegion> {
  const url = new URL("../example-firebase.json", import.meta.url);
  const path = fileURLToPath(url);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, FirebaseRegion>;
}

function fromEpoch(seconds?: number) {
  return new Date((seconds ?? Math.floor(Date.now() / 1000)) * 1000);
}

function moistureStatus(value?: string): MoistureStatus {
  const normalized = value?.toLowerCase();
  if (normalized === "basah") return MoistureStatus.BASAH;
  if (normalized === "lembab") return MoistureStatus.LEMBAB;
  return MoistureStatus.KERING;
}

function relayState(value?: boolean): RelayState {
  return value ? RelayState.ON : RelayState.OFF;
}

function blockPolygon(regionName: string, blockName: string, blockIndex: number) {
  if (!regionName.toLowerCase().includes("maos")) return undefined;
  const coordinates = MAOS_BLOCK_POLYGONS[blockName] ?? Object.values(MAOS_BLOCK_POLYGONS)[blockIndex];
  return coordinates ? { type: "Polygon", coordinates } : undefined;
}

async function seedUsers() {
  await prisma.user.deleteMany({ where: { email: { in: LEGACY_SEED_EMAILS } } });

  const userMap: Record<string, string> = {};
  for (const input of USERS) {
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: { name: input.name, role: input.role, passwordHash, isActive: true },
      create: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role,
        isActive: true,
      },
    });

    userMap[input.email] = user.id;
    const profile = PROFILES[input.email];
    if (profile) {
      await prisma.userProfile.upsert({
        where: { userId: user.id },
        update: profile,
        create: { userId: user.id, ...profile },
      });
    }
  }
  return userMap;
}

async function main() {
  console.log("Seeding Adosistering database...");

  const firebaseExample = readFirebaseExample();
  const users = await seedUsers();
  const superadminId = users["superadmin@test.com"];
  const adminId = users["admin@test.com"];
  const farmerIds = ["user@test.com", "kawistamaos@adosistering.labgo.id"].map((email) => users[email]);

  for (const [regionName, regionNode] of Object.entries(firebaseExample)) {
    const settings = regionNode.region_settings ?? {};
    const region = await prisma.region.upsert({
      where: { name: regionName },
      update: {
        description: `Wilayah irigasi ${regionName}`,
        latitude: "-7.6114790000000000",
        longitude: "109.1773600000000000",
        firebaseSyncStatus: SyncStatus.SYNCED,
        firebaseSyncedAt: new Date(),
      },
      create: {
        name: regionName,
        description: `Wilayah irigasi ${regionName}`,
        latitude: "-7.6114790000000000",
        longitude: "109.1773600000000000",
        createdById: superadminId,
        firebaseSyncStatus: SyncStatus.SYNCED,
        firebaseSyncedAt: new Date(),
      },
    });

    await prisma.adminRegionAssignment.upsert({
      where: { adminId_regionId: { adminId, regionId: region.id } },
      update: {},
      create: { adminId, regionId: region.id, assignedById: superadminId },
    });

    for (const farmerId of farmerIds) {
      await prisma.userRegionAssignment.upsert({
        where: { userId_regionId: { userId: farmerId, regionId: region.id } },
        update: {},
        create: { userId: farmerId, regionId: region.id, assignedById: adminId },
      });

      await prisma.indicatorThreshold.upsert({
        where: { userId_regionId: { userId: farmerId, regionId: region.id } },
        update: {
          dryMaxPercent: settings.batas_kering ?? 40,
          wetMinPercent: settings.batas_basah ?? 80,
          displayDryMaxPercent: 40,
          displayMoistMaxPercent: 70,
          displayWetMinPercent: 80,
          landPreference: MoistureStatus.LEMBAB,
        },
        create: {
          userId: farmerId,
          regionId: region.id,
          dryMaxPercent: settings.batas_kering ?? 40,
          wetMinPercent: settings.batas_basah ?? 80,
          displayDryMaxPercent: 40,
          displayMoistMaxPercent: 70,
          displayWetMinPercent: 80,
          landPreference: MoistureStatus.LEMBAB,
        },
      });
    }

    await prisma.systemSetting.upsert({
      where: { key: `region_settings:${regionName}` },
      update: { value: settings },
      create: { key: `region_settings:${regionName}`, value: settings },
    });

    const blocks = Object.entries(regionNode.blocks ?? {});
    for (const [blockIndex, [blockName, sprayers]] of blocks.entries()) {
      const block = await prisma.block.upsert({
        where: { regionId_name: { regionId: region.id, name: blockName } },
        update: {
          polygonGeojson: blockPolygon(regionName, blockName, blockIndex),
          firebaseSyncStatus: SyncStatus.SYNCED,
          firebaseSyncedAt: new Date(),
        },
        create: {
          regionId: region.id,
          name: blockName,
          areaHectare: 1 + blockIndex * 0.5,
          polygonGeojson: blockPolygon(regionName, blockName, blockIndex),
          createdById: adminId,
          firebaseSyncStatus: SyncStatus.SYNCED,
          firebaseSyncedAt: new Date(),
        },
      });

      for (const [sprayerName, sprayerNode] of Object.entries(sprayers)) {
        const sprayer = await prisma.sprayer.upsert({
          where: { blockId_hardwareId: { blockId: block.id, hardwareId: sprayerName } },
          update: {
            displayName: sprayerName.replace(/_/g, " "),
            isActive: true,
            firebaseSyncStatus: SyncStatus.SYNCED,
            firebaseSyncedAt: new Date(),
          },
          create: {
            blockId: block.id,
            hardwareId: sprayerName,
            displayName: sprayerName.replace(/_/g, " "),
            isActive: true,
            firebaseSyncStatus: SyncStatus.SYNCED,
            firebaseSyncedAt: new Date(),
          },
        });

        const live = sprayerNode.live_data;
        if (live) {
          const recordedAt = fromEpoch(live.last_updated);
          const exists = await prisma.sensorReading.findFirst({
            where: { blockId: block.id, sprayerId: sprayer.id, recordedAt },
            select: { id: true },
          });
          if (!exists) {
            await prisma.sensorReading.create({
              data: {
                blockId: block.id,
                sprayerId: sprayer.id,
                moisturePercent: live.moisture_percent ?? 0,
                flowLmin: live.flow_Lmin ?? 0,
                totalVolumeLiter: live.totalVolume ?? null,
                moistureStatus: moistureStatus(live.moisture_status),
                pumpStatus: sprayerNode.control?.pump_status ? "ON" : "OFF",
                windDirection: live.arah_angin ?? null,
                recordedAt,
              },
            });
          }
        }

        for (const [dateKey, entries] of Object.entries(sprayerNode.history ?? {})) {
          for (const [eventId, entry] of Object.entries(entries)) {
            await prisma.irrigationEvent.upsert({
              where: { firebaseEventId: eventId },
              update: {
                blockId: block.id,
                sprayerId: sprayer.id,
                mode: entry.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL,
                relay: relayState(entry.pump_status),
                durationSeconds: entry.duration ?? null,
                totalVolumeLiter: entry.totalVolume ?? null,
                firebaseDateKey: dateKey,
                startedAt: fromEpoch(entry.starttime ?? entry.timestamp),
                endedAt: entry.endtime ? fromEpoch(entry.endtime) : null,
              },
              create: {
                blockId: block.id,
                sprayerId: sprayer.id,
                actorId: null,
                mode: entry.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL,
                relay: relayState(entry.pump_status),
                reason: "Imported from Firebase RTDB snapshot",
                durationSeconds: entry.duration ?? null,
                totalVolumeLiter: entry.totalVolume ?? null,
                firebaseEventId: eventId,
                firebaseDateKey: dateKey,
                startedAt: fromEpoch(entry.starttime ?? entry.timestamp),
                endedAt: entry.endtime ? fromEpoch(entry.endtime) : null,
              },
            });

            const recordedAt = fromEpoch(entry.timestamp ?? entry.endtime ?? entry.starttime);
            const exists = await prisma.sensorReading.findFirst({
              where: { blockId: block.id, sprayerId: sprayer.id, recordedAt },
              select: { id: true },
            });
            if (!exists) {
              await prisma.sensorReading.create({
                data: {
                  blockId: block.id,
                  sprayerId: sprayer.id,
                  moisturePercent: entry.moisture_percent ?? 0,
                  flowLmin: entry.flow_Lmin ?? 0,
                  totalVolumeLiter: entry.totalVolume ?? null,
                  moistureStatus: moistureStatus(entry.moisture_status),
                  pumpStatus: entry.pump_status ? "ON" : "OFF",
                  recordedAt,
                },
              });
            }
          }
        }
      }
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: "safetyTimeout" },
    update: { value: { min: 2, max: 10 } },
    create: { key: "safetyTimeout", value: { min: 2, max: 10 } },
  });

  await prisma.systemSetting.upsert({
    where: { key: "mapConfig" },
    update: { value: { lat: -7.611479, lng: 109.17736, zoom: 18 } },
    create: { key: "mapConfig", value: { lat: -7.611479, lng: 109.17736, zoom: 18 } },
  });

  await prisma.systemSetting.upsert({
    where: { key: "seed.version" },
    update: { value: { version: 5, source: "example-firebase.json", seededAt: new Date().toISOString() } },
    create: {
      key: "seed.version",
      value: { version: 5, source: "example-firebase.json", seededAt: new Date().toISOString() },
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: superadminId,
      action: ActivityAction.CREATE,
      entityType: "Seed",
      metadata: { source: "example-firebase.json", version: 5 },
    },
  });

  console.log("Seed complete.");
  console.log("superadmin@test.com / Password123!");
  console.log("admin@test.com / Password123!");
  console.log("user@test.com / Password123!");
  console.log("kawistamaos@adosistering.labgo.id / mernek123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

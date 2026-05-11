import { initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, onValue, ref, type Database } from "firebase/database";
import { calculateMoistureStatus, firebaseSegment, type LiveSprayerData, type Threshold } from "~/domain/irrigation";

let app: FirebaseApp | undefined;
let database: Database | undefined;

function firebaseConfig() {
  const env = import.meta.env;
  if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_DATABASE_URL || !env.VITE_FIREBASE_PROJECT_ID || !env.VITE_FIREBASE_APP_ID) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

function clientDb(): Database | null {
  const config = firebaseConfig();
  if (!config) return null;
  app ??= initializeApp(config);
  database ??= getDatabase(app);
  return database;
}

function mapSprayerNode(
  sprayerId: string,
  value: Record<string, unknown>,
  regionName: string,
  blockName: string,
  threshold: Threshold,
): LiveSprayerData {
  const data = (value?.data ?? {}) as Record<string, unknown>;
  const control = (value?.control ?? {}) as Record<string, unknown>;
  const moisturePercent = Number(data.moisture_percent ?? 0);
  return {
    regionName,
    blockName,
    sprayerId,
    flowLmin: Number(data.flow_Lmin ?? 0),
    moisturePercent,
    moistureStatus: calculateMoistureStatus(moisturePercent, threshold),
    pumpStatus: String(data.status_pompa ?? "STANDBY"),
    mode: control.mode === 1 ? 1 : 0,
    relay: control.relay === 1 ? 1 : 0,
  };
}

export function subscribeToSprayer(
  input: { regionName: string; blockName: string; sprayerId: string; threshold: Threshold },
  onData: (data: LiveSprayerData) => void,
): () => void {
  const db = clientDb();
  if (!db) return () => {};
  const path = `${firebaseSegment(input.regionName)}/${firebaseSegment(input.blockName)}/${firebaseSegment(input.sprayerId)}`;
  return onValue(ref(db, path), (snap) => {
    const v = snap.val() ?? {};
    onData(mapSprayerNode(input.sprayerId, v, input.regionName, input.blockName, input.threshold));
  });
}

export function subscribeToBlock(
  input: { regionName: string; blockName: string; threshold: Threshold },
  onData: (sprayers: LiveSprayerData[]) => void,
): () => void {
  const db = clientDb();
  if (!db) return () => {};
  const path = `${firebaseSegment(input.regionName)}/${firebaseSegment(input.blockName)}`;
  return onValue(ref(db, path), (snap) => {
    const block = snap.val();
    if (!block) { onData([]); return; }
    const sprayers: LiveSprayerData[] = Object.entries(block as Record<string, unknown>)
      .filter(([k]) => k !== ".provisioned")
      .map(([id, v]) => mapSprayerNode(id, v as Record<string, unknown>, input.regionName, input.blockName, input.threshold));
    onData(sprayers);
  });
}

export function subscribeToRegion(
  input: { regionName: string; threshold: Threshold },
  onData: (data: Record<string, LiveSprayerData[]>) => void,
): () => void {
  const db = clientDb();
  if (!db) return () => {};
  const path = firebaseSegment(input.regionName);
  return onValue(ref(db, path), (snap) => {
    const region = snap.val();
    if (!region) { onData({}); return; }
    const result: Record<string, LiveSprayerData[]> = {};
    for (const [blockName, block] of Object.entries(region as Record<string, unknown>)) {
      if (blockName === ".provisioned") continue;
      result[blockName] = Object.entries((block as Record<string, unknown>) ?? {})
        .filter(([k]) => k !== ".provisioned")
        .map(([id, v]) => mapSprayerNode(id, v as Record<string, unknown>, input.regionName, blockName, input.threshold));
    }
    onData(result);
  });
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfig() !== null;
}

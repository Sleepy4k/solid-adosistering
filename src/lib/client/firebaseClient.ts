import { initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, onValue, ref, type Database } from "firebase/database";
import {
  calculateMoistureStatus,
  firebaseBlockPath,
  firebaseRegionBlocksPath,
  firebaseSprayerPath,
  type LiveSprayerData,
  type Threshold,
} from "~/lib/shared/irrigation";

let app: FirebaseApp | undefined;
let database: Database | undefined;
type FirebaseErrorHandler = (error: Error) => void;

function firebaseConfig() {
  const env = import.meta.env;
  if (
    !env.VITE_FIREBASE_API_KEY ||
    !env.VITE_FIREBASE_DATABASE_URL ||
    !env.VITE_FIREBASE_PROJECT_ID ||
    !env.VITE_FIREBASE_APP_ID
  )
    return null;
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
  try {
    app ??= initializeApp(config);
    database ??= getDatabase(app);
    return database;
  } catch {
    return null;
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error("Firebase realtime database gagal diakses.");
}

function isSprayerNode(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return "live_data" in v || "control" in v || "history" in v || "data" in v;
}

function mapSprayerNode(
  sprayerId: string,
  value: Record<string, unknown>,
  regionName: string,
  blockName: string,
  threshold: Threshold,
): LiveSprayerData {
  const liveData = (value?.live_data ?? value?.data ?? {}) as Record<string, unknown>;
  const control = (value?.control ?? {}) as Record<string, unknown>;
  const moisturePercent = Number(liveData.moisture_percent ?? liveData.moisture ?? 0);
  const volumeDivider = threshold.volumeDivider ?? 1;
  const flowLmin = Number(liveData.flow_Lmin ?? liveData.flowRate ?? 0) / volumeDivider;
  const rawVolume = Number(
    liveData.totalVolume ??
      liveData.totalVolume_L ??
      liveData.total_volume_L ??
      liveData.total_volume ??
      liveData.volume_L ??
      liveData.waterVolume ??
      0,
  );
  const totalVolumeLiter = rawVolume / volumeDivider;
  const pumpOn =
    control.pump_status === true || control.pump_status === 1 || control.relay === 1 || control.relay === "1";
  const autoMode = control.mode === "AUTO" || control.mode === 1 || control.mode === "1";
  const moistureStatus = String(liveData.moisture_status ?? "");
  return {
    regionName,
    blockName,
    sprayerId,
    flowLmin,
    moisturePercent,
    moistureStatus:
      moistureStatus === "Kering" || moistureStatus === "Lembab" || moistureStatus === "Basah"
        ? moistureStatus
        : calculateMoistureStatus(moisturePercent, threshold),
    pumpStatus: pumpOn ? "ON" : "OFF",
    pumpOn,
    totalVolumeLiter,
    windDirection: typeof liveData.arah_angin === "string" ? liveData.arah_angin : null,
    lastUpdated: Number(liveData.last_updated ?? liveData.timestamp ?? 0) || null,
    mode: autoMode ? 0 : 1,
    relay: pumpOn ? 1 : 0,
  };
}

export function subscribeToSprayer(
  input: { regionName: string; blockName: string; sprayerId: string; threshold: Threshold },
  onData: (data: LiveSprayerData) => void,
  onError?: FirebaseErrorHandler,
): () => void {
  const db = clientDb();
  if (!db) {
    onError?.(new Error("Konfigurasi Firebase belum lengkap."));
    return () => {};
  }
  const path = firebaseSprayerPath(input.regionName, input.blockName, input.sprayerId);
  try {
    return onValue(
      ref(db, path),
      (snap) => {
        const v = snap.val() ?? {};
        onData(mapSprayerNode(input.sprayerId, v, input.regionName, input.blockName, input.threshold));
      },
      (error) => onError?.(toError(error)),
    );
  } catch (error) {
    onError?.(toError(error));
    return () => {};
  }
}

export function subscribeToBlock(
  input: { regionName: string; blockName: string; threshold: Threshold },
  onData: (sprayers: LiveSprayerData[]) => void,
  onError?: FirebaseErrorHandler,
): () => void {
  const db = clientDb();
  if (!db) {
    onError?.(new Error("Konfigurasi Firebase belum lengkap."));
    return () => {};
  }
  const path = firebaseBlockPath(input.regionName, input.blockName);
  try {
    return onValue(
      ref(db, path),
      (snap) => {
        const block = snap.val();
        if (!block) {
          onData([]);
          return;
        }
        const sprayers: LiveSprayerData[] = Object.entries(block as Record<string, unknown>)
          .filter(([k, v]) => !k.startsWith("_") && isSprayerNode(v))
          .map(([id, v]) =>
            mapSprayerNode(id, v as Record<string, unknown>, input.regionName, input.blockName, input.threshold),
          );
        onData(sprayers);
      },
      (error) => onError?.(toError(error)),
    );
  } catch (error) {
    onError?.(toError(error));
    return () => {};
  }
}

export function subscribeToRegion(
  input: { regionName: string; threshold: Threshold },
  onData: (data: Record<string, LiveSprayerData[]>) => void,
  onError?: FirebaseErrorHandler,
): () => void {
  const db = clientDb();
  if (!db) {
    onError?.(new Error("Konfigurasi Firebase belum lengkap."));
    return () => {};
  }
  const path = firebaseRegionBlocksPath(input.regionName);
  try {
    return onValue(
      ref(db, path),
      (snap) => {
        const blocks = snap.val();
        if (!blocks) {
          onData({});
          return;
        }
        const result: Record<string, LiveSprayerData[]> = {};
        for (const [blockName, block] of Object.entries(blocks as Record<string, unknown>)) {
          if (blockName.startsWith("_")) continue;
          result[blockName] = Object.entries((block as Record<string, unknown>) ?? {})
            .filter(([k, v]) => !k.startsWith("_") && isSprayerNode(v))
            .map(([id, v]) =>
              mapSprayerNode(id, v as Record<string, unknown>, input.regionName, blockName, input.threshold),
            );
        }
        onData(result);
      },
      (error) => onError?.(toError(error)),
    );
  } catch (error) {
    onError?.(toError(error));
    return () => {};
  }
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfig() !== null;
}

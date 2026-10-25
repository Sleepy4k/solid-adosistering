import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getDatabase, onValue, ref, type Database } from "firebase/database";
import { createFlowEstimator, type FlowEstimator } from "~/lib/shared/flow";
import {
  calculateMoistureStatus,
  firebaseBlockPath,
  firebaseSprayerPath,
  type LiveSprayerData,
  type Threshold,
} from "~/lib/shared/irrigation";

let app: FirebaseApp | undefined;
let database: Database | undefined;
let appCheckInitialized = false;
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

function initializeAppCheckIfConfigured(firebaseApp: FirebaseApp) {
  const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim();
  if (!siteKey || appCheckInitialized) return;
  try {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (error) {
    // App Check is optional; a failure must not break the dashboard.
    console.error("[firebase] App Check initialization failed", error);
  }
}

function clientDb(): Database | null {
  const config = firebaseConfig();
  if (!config) return null;
  try {
    app ??= initializeApp(config);
    initializeAppCheckIfConfigured(app);
    database ??= getDatabase(app);
    return database;
  } catch {
    return null;
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error("Firebase realtime database gagal diakses.");
}

/** How often flow is re-evaluated so it decays to zero once the counter stops. */
const FLOW_REFRESH_MS = 5_000;

type FlowContext = {
  estimator: FlowEstimator;
  nowMs: number;
  /** True for a real Firebase snapshot; false for a decay-only re-evaluation. */
  observe: boolean;
};

/**
 * `total_liter` is the cumulative counter written by the devices; the older
 * keys remain as fallbacks for nodes provisioned by earlier firmware.
 */
function liveTotalLiter(liveData: Record<string, unknown>) {
  return Number(
    liveData.total_liter ??
      liveData.totalVolume ??
      liveData.totalVolume_L ??
      liveData.total_volume_L ??
      liveData.total_volume ??
      liveData.volume_L ??
      liveData.waterVolume ??
      0,
  );
}

/**
 * `last_updated` is the latest watering update and may stay old while the
 * device idles, so liveness also considers `last_update`; the newest wins.
 * Values are epoch seconds (legacy firmware wrote milliseconds).
 */
function latestDeviceSeen(liveData: Record<string, unknown>) {
  const candidates = [liveData.last_updated, liveData.last_update, liveData.timestamp]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => (value > 1e12 ? value / 1000 : value));
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function mapSprayerNode(
  sprayerId: string,
  value: Record<string, unknown>,
  regionName: string,
  blockName: string,
  threshold: Threshold,
  flow: FlowContext,
): LiveSprayerData {
  const liveData = (value?.live_data ?? value?.data ?? {}) as Record<string, unknown>;
  const control = (value?.control ?? {}) as Record<string, unknown>;
  const moisturePercent = Number(liveData.moisture_percent ?? liveData.moisture ?? 0);
  const volumeDivider = threshold.volumeDivider ?? 1;
  const totalVolumeLiter = liveTotalLiter(liveData) / volumeDivider;
  const pumpOn =
    control.pump_status === true || control.pump_status === 1 || control.relay === 1 || control.relay === "1";
  const autoMode = control.mode === "AUTO" || control.mode === 1 || control.mode === "1";
  const moistureStatus = String(liveData.moisture_status ?? "");

  // `flow_Lmin` is not reported by the devices, so the rate is derived from the
  // counter instead of being read from Firebase.
  const flowKey = `${regionName}/${blockName}/${sprayerId}`;
  if (flow.observe) flow.estimator.push(flowKey, totalVolumeLiter, flow.nowMs);
  const flowLmin = flow.estimator.estimate(flowKey, flow.nowMs, pumpOn);

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
    lastSeen: latestDeviceSeen(liveData),
    mode: autoMode ? 0 : 1,
    relay: pumpOn ? 1 : 0,
  };
}

/**
 * Subscribe to several paths and publish `project(values)` once every path has
 * delivered at least one snapshot. Between snapshots the projection is re-run
 * on a timer so time-dependent values (the derived flow rate) settle to zero
 * without needing another Firebase event.
 *
 * Only `live_data` and `control` are ever subscribed: listening to a whole
 * sprayer or block node would download its entire `history` on every update.
 */
function watch<T>(
  db: Database,
  paths: string[],
  project: (values: unknown[], flow: FlowContext) => T,
  signature: (value: T) => string,
  onData: (value: T) => void,
  onError?: FirebaseErrorHandler,
): () => void {
  const estimator = createFlowEstimator();
  const values: unknown[] = paths.map(() => null);
  const received = new Set<number>();
  let lastSignature = "";

  const emit = (observe: boolean) => {
    if (received.size < paths.length) return;
    const value = project(values, { estimator, nowMs: Date.now(), observe });
    const next = signature(value);
    // Decay ticks only publish when something visible actually changed.
    if (!observe && next === lastSignature) return;
    lastSignature = next;
    onData(value);
  };

  if (paths.length === 0) {
    onData(project(values, { estimator, nowMs: Date.now(), observe: true }));
    return () => {};
  }

  const unsubscribers: Array<() => void> = [];
  try {
    paths.forEach((path, index) => {
      unsubscribers.push(
        onValue(
          ref(db, path),
          (snap) => {
            values[index] = snap.val();
            received.add(index);
            emit(true);
          },
          (error) => onError?.(toError(error)),
        ),
      );
    });
    const timer = setInterval(() => emit(false), FLOW_REFRESH_MS);
    return () => {
      clearInterval(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  } catch (error) {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    onError?.(toError(error));
    return () => {};
  }
}

const sprayerListSignature = (list: LiveSprayerData[]) =>
  list.map((item) => `${item.sprayerId}:${item.flowLmin.toFixed(3)}`).join("|");

/** Rebuild the `{ live_data, control }` shape `mapSprayerNode` expects. */
function sprayerNodeFrom(liveData: unknown, control: unknown): Record<string, unknown> | null {
  if (liveData == null && control == null) return null;
  return { live_data: liveData ?? {}, control: control ?? {} };
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
  const base = firebaseSprayerPath(input.regionName, input.blockName, input.sprayerId);
  return watch(
    db,
    [`${base}/live_data`, `${base}/control`],
    ([liveData, control], flow) =>
      mapSprayerNode(
        input.sprayerId,
        sprayerNodeFrom(liveData, control) ?? {},
        input.regionName,
        input.blockName,
        input.threshold,
        flow,
      ),
    (item) => item.flowLmin.toFixed(3),
    onData,
    onError,
  );
}

/**
 * Live data for the given sprayers of one block. `sprayerIds` are the Firebase
 * node keys (the hardware ids); each contributes two small listeners.
 */
export function subscribeToBlock(
  input: { regionName: string; blockName: string; sprayerIds: string[]; threshold: Threshold },
  onData: (sprayers: LiveSprayerData[]) => void,
  onError?: FirebaseErrorHandler,
): () => void {
  const db = clientDb();
  if (!db) {
    onError?.(new Error("Konfigurasi Firebase belum lengkap."));
    return () => {};
  }
  const ids = [...new Set(input.sprayerIds)];
  const paths = ids.flatMap((id) => {
    const base = firebaseSprayerPath(input.regionName, input.blockName, id);
    return [`${base}/live_data`, `${base}/control`];
  });
  return watch(
    db,
    paths,
    (values, flow) => {
      const sprayers: LiveSprayerData[] = [];
      ids.forEach((id, index) => {
        const node = sprayerNodeFrom(values[index * 2], values[index * 2 + 1]);
        if (node) sprayers.push(mapSprayerNode(id, node, input.regionName, input.blockName, input.threshold, flow));
      });
      return sprayers;
    },
    sprayerListSignature,
    onData,
    onError,
  );
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfig() !== null;
}

import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getDatabase, onValue, ref, type Database } from "firebase/database";
import { createFlowEstimator, createVolumeTracker, type FlowEstimator, type VolumeTracker } from "~/lib/shared/flow";
import {
  calculateMoistureStatus,
  firebaseBlockPath,
  firebaseSegment,
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
  volume: VolumeTracker;
  nowMs: number;
  /** True for a real Firebase snapshot; false for a decay-only re-evaluation. */
  observe: boolean;
};

/**
 * Optional cumulative liter counter. The V2 firmware does not write one (it
 * reports `flow_Lmin` only); older firmware wrote `total_liter`. `null` means
 * "no counter", which makes the volume derive from the flow rate instead.
 */
function liveTotalLiter(liveData: Record<string, unknown>): number | null {
  const raw =
    liveData.total_liter ??
    liveData.totalVolume ??
    liveData.totalVolume_L ??
    liveData.total_volume_L ??
    liveData.total_volume ??
    liveData.volume_L ??
    liveData.waterVolume;
  if (raw === undefined || raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Device epochs before this are an unsynced RTC (1970 + uptime), not a time. */
const MIN_VALID_EPOCH_SECONDS = 1_700_000_000;

/**
 * `last_updated` is the device heartbeat: the firmware stamps it (epoch
 * seconds, `time(nullptr)`) on every `live_data` write. Legacy firmware wrote
 * milliseconds. A value before the NTP-synced epoch means the clock was unset.
 */
function deviceHeartbeat(liveData: Record<string, unknown>) {
  const raw = Number(liveData.last_updated ?? liveData.timestamp);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const seconds = raw > 1e12 ? raw / 1000 : raw;
  return seconds >= MIN_VALID_EPOCH_SECONDS ? seconds : null;
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
  const pumpOn =
    control.pump_status === true ||
    control.pump_status === 1 ||
    control.pump_status === "true" ||
    control.pump_status === "1" ||
    control.relay === 1 ||
    control.relay === "1";
  const autoMode = control.mode === "AUTO" || control.mode === 1 || control.mode === "1";

  // Flow: the firmware reports `flow_Lmin` in L/min (pulses / 27 per liter,
  // 0 while the block's valve is closed). Only when a device has no usable
  // rate but does keep a liter counter is the rate derived from that counter.
  const flowKey = `${regionName}/${blockName}/${sprayerId}`;
  const counter = liveTotalLiter(liveData);
  const reportedFlow = Number(liveData.flow_Lmin ?? liveData.flowRate);
  let flowLmin = Number.isFinite(reportedFlow) && reportedFlow > 0 ? reportedFlow / volumeDivider : 0;
  if (counter !== null) {
    if (flow.observe) flow.estimator.push(flowKey, counter / volumeDivider, flow.nowMs);
    if (flowLmin === 0) flowLmin = flow.estimator.estimate(flowKey, flow.nowMs, pumpOn);
  }
  // Liters of the running session: L/min x minutes, integrated between updates.
  const sessionVolumeLiter = flow.volume.advance(flowKey, flowLmin, flow.nowMs);

  return {
    regionName,
    blockName,
    sprayerId,
    flowLmin,
    moisturePercent,
    // The firmware never writes `moisture_status`; classify from the percentage
    // with the same boundaries the device uses.
    moistureStatus: calculateMoistureStatus(moisturePercent, threshold),
    pumpStatus: pumpOn ? "ON" : "OFF",
    pumpOn,
    totalVolumeLiter: counter === null ? 0 : counter / volumeDivider,
    hasVolumeCounter: counter !== null,
    sessionVolumeLiter,
    windDirection: typeof liveData.arah_angin === "string" ? liveData.arah_angin : null,
    lastUpdated: deviceHeartbeat(liveData),
    lastSeen: deviceHeartbeat(liveData),
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
  const volume = createVolumeTracker();
  const values: unknown[] = paths.map(() => null);
  const received = new Set<number>();
  let lastSignature = "";

  const emit = (observe: boolean) => {
    if (received.size < paths.length) return;
    const value = project(values, { estimator, volume, nowMs: Date.now(), observe });
    const next = signature(value);
    // Decay ticks only publish when something visible actually changed.
    if (!observe && next === lastSignature) return;
    lastSignature = next;
    onData(value);
  };

  if (paths.length === 0) {
    onData(project(values, { estimator, volume, nowMs: Date.now(), observe: true }));
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
  list.map((item) => `${item.sprayerId}:${item.flowLmin.toFixed(3)}:${item.sessionVolumeLiter.toFixed(1)}`).join("|");

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
    (item) => `${item.flowLmin.toFixed(3)}:${item.sessionVolumeLiter.toFixed(1)}`,
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

/**
 * The shared pump of a region. The firmware writes `{ state: "ON" | "OFF" }` to
 * `<region>/pump` whenever any block's valve is open.
 */
export function subscribeToRegionPump(
  input: { regionName: string },
  onData: (on: boolean | null) => void,
  onError?: FirebaseErrorHandler,
): () => void {
  const db = clientDb();
  if (!db) {
    onError?.(new Error("Konfigurasi Firebase belum lengkap."));
    return () => {};
  }
  try {
    return onValue(
      ref(db, `${firebaseSegment(input.regionName)}/pump/state`),
      (snap) => {
        const value: unknown = snap.val();
        onData(value === null || value === undefined ? null : value === "ON" || value === true);
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

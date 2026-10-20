import { syncFirebaseSnapshotToDatabase } from "../integrations/firebase";

/**
 * A failed sync no longer advances the SQL marker, so without a brake every
 * read would start a fresh Firebase walk. Attempt at most once per minute;
 * the in-flight dedupe inside `syncFirebaseSnapshotToDatabase` still applies.
 */
const RETRY_INTERVAL_MS = 60_000;
let lastAttemptAt = 0;

/**
 * Fire-and-forget cache refresh for read paths. Read actions must never block
 * on the Firebase import: the SQL snapshot is returned immediately and the
 * refresh runs in the background.
 */
export function scheduleFirebaseRefresh() {
  const now = Date.now();
  if (now - lastAttemptAt < RETRY_INTERVAL_MS) return;
  lastAttemptAt = now;

  try {
    void syncFirebaseSnapshotToDatabase().catch((error: unknown) => {
      console.error("[firebase] background refresh failed:", error);
    });
  } catch (error) {
    console.error("[firebase] background refresh failed:", error);
  }
}

import { syncFirebaseSnapshotToDatabase } from "../integrations/firebase";

/**
 * A failed sync no longer advances the SQL marker, so without a brake every
 * read would start a fresh Firebase walk. Attempt at most once per minute;
 * the in-flight dedupe inside `syncFirebaseSnapshotToDatabase` still applies.
 */
const RETRY_INTERVAL_MS = 60_000;
let lastAttemptAt = 0;

/** Start a refresh if one is due; the returned promise never rejects. */
function startRefresh(): Promise<void> | null {
  const now = Date.now();
  if (now - lastAttemptAt < RETRY_INTERVAL_MS) return null;
  lastAttemptAt = now;

  try {
    return syncFirebaseSnapshotToDatabase().then(
      () => undefined,
      (error: unknown) => {
        console.error("[firebase] background refresh failed:", error);
      },
    );
  } catch (error) {
    console.error("[firebase] background refresh failed:", error);
    return null;
  }
}

/**
 * Fire-and-forget cache refresh for read paths. Read actions must never block
 * on the Firebase import: the SQL snapshot is returned immediately and the
 * refresh runs in the background.
 */
export function scheduleFirebaseRefresh() {
  void startRefresh();
}

/**
 * Like `scheduleFirebaseRefresh`, but waits for a due refresh for at most
 * `waitMs` so the response reflects it when Firebase answers quickly. The
 * refresh keeps running past the deadline and a slow Firebase never fails the
 * request.
 */
export async function refreshFirebaseWithin(waitMs = 1_500) {
  const refresh = startRefresh();
  if (!refresh) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  try {
    await Promise.race([refresh, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

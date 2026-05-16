import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { serverConfig } from "../config";

export function firebaseAdminDb() {
  if (serverConfig.firebase.syncDisabled) {
    throw new Error("Firebase syncing is disabled by FIREBASE_SYNC_DISABLED=true");
  }

  const { projectId, clientEmail, privateKey, databaseUrl } = serverConfig.firebase;
  if (!projectId || !clientEmail || !privateKey || !databaseUrl) {
    throw new Error("Firebase Admin config is required before Firebase syncing");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
      databaseURL: databaseUrl,
    });

  return getDatabase(app);
}

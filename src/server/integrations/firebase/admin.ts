import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { serverConfig } from "../../config";

let adminApp: App | undefined;

function serviceAccountCredential() {
  if (serverConfig.firebase.serviceAccountJson) {
    try {
      const parsed = JSON.parse(serverConfig.firebase.serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error("missing project_id, client_email, or private_key");
      }
      return cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, "\n"),
      });
    } catch (error) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${error instanceof Error ? error.message : "parse error"}`,
      );
    }
  }

  const { projectId, clientEmail, privateKey } = serverConfig.firebase;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  return cert({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });
}

export function firebaseAdminApp(): App {
  if (adminApp) return adminApp;
  adminApp =
    getApps()[0] ??
    initializeApp({
      credential: serviceAccountCredential(),
      databaseURL: serverConfig.firebase.databaseUrl,
    });
  return adminApp;
}

export function firebaseAdminDb() {
  if (serverConfig.firebase.syncDisabled) {
    throw new Error("Firebase syncing is disabled by FIREBASE_SYNC_DISABLED=true");
  }
  if (!serverConfig.firebase.databaseUrl) {
    throw new Error("FIREBASE_DATABASE_URL is required before Firebase syncing");
  }

  return getDatabase(firebaseAdminApp());
}

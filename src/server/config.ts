import "dotenv/config";

type ConfigStatus = {
  databaseConfigured: boolean;
  firebaseAdminConfigured: boolean;
  smtpConfigured: boolean;
};

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

export const serverConfig = {
  appOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "adosistering_session",
  databaseUrl: process.env.DATABASE_URL,
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    databaseUrl: process.env.FIREBASE_DATABASE_URL,
    syncDisabled: process.env.FIREBASE_SYNC_DISABLED === "true",
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM ?? "",
  },
};

export function getServerConfigStatus(): ConfigStatus {
  return {
    databaseConfigured: hasEnv("DATABASE_URL"),
    firebaseAdminConfigured:
      hasEnv("FIREBASE_PROJECT_ID") &&
      hasEnv("FIREBASE_CLIENT_EMAIL") &&
      hasEnv("FIREBASE_PRIVATE_KEY") &&
      hasEnv("FIREBASE_DATABASE_URL"),
    smtpConfigured: hasEnv("SMTP_HOST") && hasEnv("SMTP_USER") && hasEnv("SMTP_PASS"),
  };
}

export function assertDatabaseConfigured() {
  if (!getServerConfigStatus().databaseConfigured) {
    throw new Error("DATABASE_URL is required before database access");
  }
}

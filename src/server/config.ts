import "server-only";
import "dotenv/config";

type ConfigStatus = {
  databaseConfigured: boolean;
  firebaseAdminConfigured: boolean;
  smtpConfigured: boolean;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function hasEnv(name: string): boolean {
  return Boolean(env(name));
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function smtpPort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : 587;
}

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** Hostnames allowed to serve the production bundle over plain HTTP. Intentionally exact-match only. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Local production preview/smoke tests only: the built server inlines
 * `NODE_ENV=production`, so `bun run start` against a loopback origin would
 * otherwise be rejected by the HTTPS rule. Public hostnames still fail closed.
 *
 * Exported so the middleware applies the exact same loopback rule to
 * plain-HTTP `Referer` headers during those local production previews.
 */
export function isLoopbackHttpOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:") return false;
    // WHATWG URL reports IPv6 hostnames with brackets (`[::1]`); normalise both forms.
    const hostname =
      url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
    return LOOPBACK_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

export const isProduction = process.env.NODE_ENV === "production";
/** True only for an explicit `NODE_ENV=development`, never for test/staging. */
const isNodeDevelopment = process.env.NODE_ENV === "development";
export const isDevelopment = !isProduction;

const configuredAppOrigin = normalizeOrigin(process.env.APP_ORIGIN);
export const appOrigin = configuredAppOrigin ?? (isProduction ? "" : "http://localhost:3000");

const baseCookieName = env("SESSION_COOKIE_NAME") ?? "adosistering_session";
/**
 * `__Host-` cookies are origin-locked and cannot be overwritten by subdomains.
 * They require Secure + Path=/ and no Domain attribute, which matches our cookie policy.
 * In local development the cookie must remain usable over plain HTTP, so the prefix is
 * applied in production only.
 */
export const sessionCookieName =
  isProduction && !baseCookieName.startsWith("__Host-") ? `__Host-${baseCookieName}` : baseCookieName;

export const SESSION_IDLE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_RENEW_WINDOW_SECONDS = 60 * 60 * 24;

const serviceAccountJson = env("FIREBASE_SERVICE_ACCOUNT_JSON");

/**
 * Newsletter tokens are security-sensitive (unsubscribe links are bearer
 * credentials). Production must provide a real secret; development falls back
 * to a clearly labelled value so local opt-in flows remain testable.
 */
const DEVELOPMENT_NEWSLETTER_TOKEN_SECRET = "insecure-development-only-newsletter-token-secret";
const newsletterTokenSecret = env("NEWSLETTER_TOKEN_SECRET");
const MIN_NEWSLETTER_TOKEN_SECRET_LENGTH = 32;

export const serverConfig = {
  appOrigin,
  sessionCookieName,
  /** Only enable when a trusted reverse proxy overwrites X-Forwarded-For. */
  trustProxy: env("TRUST_PROXY") === "true",
  get databaseUrl() {
    return env("DATABASE_URL");
  },
  firebase: {
    projectId: env("FIREBASE_PROJECT_ID"),
    clientEmail: env("FIREBASE_CLIENT_EMAIL"),
    privateKey: env("FIREBASE_PRIVATE_KEY"),
    databaseUrl: env("FIREBASE_DATABASE_URL"),
    serviceAccountJson,
    syncDisabled: env("FIREBASE_SYNC_DISABLED") === "true",
  },
  smtp: {
    host: env("SMTP_HOST"),
    port: smtpPort(env("SMTP_PORT")),
    secure: env("SMTP_SECURE") === "true",
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
    from: env("EMAIL_FROM") ?? "",
  },
  uploads: {
    dir: env("UPLOAD_DIR") ?? ".data/uploads",
    maxBytes: positiveInt(env("UPLOAD_MAX_BYTES"), 2 * 1024 * 1024),
  },
  newsletter: {
    tokenSecret: newsletterTokenSecret ?? (isNodeDevelopment ? DEVELOPMENT_NEWSLETTER_TOKEN_SECRET : undefined),
    confirmTtlHours: Math.min(168, positiveInt(env("NEWSLETTER_CONFIRM_TTL_HOURS"), 24)),
  },
} as const;

/** Resolve the newsletter signing secret, failing closed when production config is missing. */
export function getNewsletterTokenSecret(): string {
  const secret = serverConfig.newsletter.tokenSecret;
  if (!secret) {
    // assertServerConfig() rejects this outside development; this guard keeps
    // actions safe if they are ever invoked outside the normal request pipeline.
    throw new Error("NEWSLETTER_TOKEN_SECRET is not configured.");
  }
  // Defence in depth: actions call this directly, so a short key must be rejected
  // even when assertServerConfig() was never run (e.g. a bypassed request path).
  if (secret.length < MIN_NEWSLETTER_TOKEN_SECRET_LENGTH) {
    throw new Error(`NEWSLETTER_TOKEN_SECRET must be at least ${MIN_NEWSLETTER_TOKEN_SECRET_LENGTH} characters long.`);
  }
  return secret;
}

export function getServerConfigStatus(): ConfigStatus {
  return {
    databaseConfigured: hasEnv("DATABASE_URL"),
    firebaseAdminConfigured:
      hasEnv("FIREBASE_DATABASE_URL") &&
      (Boolean(serviceAccountJson) ||
        (hasEnv("FIREBASE_PROJECT_ID") && hasEnv("FIREBASE_CLIENT_EMAIL") && hasEnv("FIREBASE_PRIVATE_KEY"))),
    smtpConfigured: hasEnv("SMTP_HOST") && hasEnv("SMTP_USER") && hasEnv("SMTP_PASS"),
  };
}

/**
 * Validates the runtime environment without ever printing secret values.
 * Called from the middleware on the first request so `vite build` can run
 * without production credentials present.
 */
export function assertServerConfig() {
  const status = getServerConfigStatus();
  if (!status.databaseConfigured) {
    throw new Error("DATABASE_URL is required before database access.");
  }
  const url = env("DATABASE_URL") ?? "";
  if (!/^(mysql|mariadb):\/\//i.test(url)) {
    throw new Error("DATABASE_URL must be a mysql:// or mariadb:// connection string.");
  }
  if (isProduction && !configuredAppOrigin) {
    throw new Error("APP_ORIGIN must be a valid absolute URL in production.");
  }
  if (isProduction && configuredAppOrigin && !configuredAppOrigin.startsWith("https://")) {
    if (!isLoopbackHttpOrigin(configuredAppOrigin)) {
      throw new Error("APP_ORIGIN must use HTTPS in production.");
    }
  }
  if (!status.firebaseAdminConfigured && !serverConfig.firebase.syncDisabled) {
    console.warn("[config] Firebase Admin is not configured; live telemetry sync is disabled.");
  }
  if (!status.smtpConfigured) {
    console.warn("[config] SMTP is not configured; transactional email delivery is disabled.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(serverConfig.sessionCookieName)) {
    throw new Error("SESSION_COOKIE_NAME may only contain letters, numbers, underscores, and dashes.");
  }
  const newsletterSecret = env("NEWSLETTER_TOKEN_SECRET");
  if (!isNodeDevelopment && !newsletterSecret) {
    throw new Error("NEWSLETTER_TOKEN_SECRET is required outside development.");
  }
  if (newsletterSecret && newsletterSecret.length < MIN_NEWSLETTER_TOKEN_SECRET_LENGTH) {
    throw new Error("NEWSLETTER_TOKEN_SECRET must be at least 32 characters long.");
  }
  if (isNodeDevelopment && !newsletterSecret) {
    console.warn("[config] NEWSLETTER_TOKEN_SECRET is not set; using an insecure development-only secret.");
  }
}

export function assertDatabaseConfigured() {
  if (!getServerConfigStatus().databaseConfigured) {
    throw new Error("DATABASE_URL is required before database access");
  }
}

import { siteConfig } from "./site";

export type PublicAppConfig = {
  appName: string;
  appConfigured: boolean;
  firebaseConfigured: boolean;
  defaultTelemetryTarget: {
    regionName: string;
    blockName: string;
    sprayerId: string;
    dryMaxPercent: number;
    wetMinPercent: number;
  } | null;
};

function hasPublicEnv(name: string) {
  return Boolean(import.meta.env[name]?.trim());
}

function numberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const publicAppConfig: PublicAppConfig = {
  appName: import.meta.env.VITE_APP_NAME ?? siteConfig.name,
  appConfigured: import.meta.env.VITE_APP_CONFIGURED === "true",
  firebaseConfigured:
    hasPublicEnv("VITE_FIREBASE_API_KEY") &&
    hasPublicEnv("VITE_FIREBASE_DATABASE_URL") &&
    hasPublicEnv("VITE_FIREBASE_PROJECT_ID") &&
    hasPublicEnv("VITE_FIREBASE_APP_ID"),
  defaultTelemetryTarget:
    import.meta.env.VITE_DEFAULT_REGION_NAME &&
    import.meta.env.VITE_DEFAULT_BLOCK_NAME &&
    import.meta.env.VITE_DEFAULT_SPRAYER_ID
      ? {
          regionName: import.meta.env.VITE_DEFAULT_REGION_NAME,
          blockName: import.meta.env.VITE_DEFAULT_BLOCK_NAME,
          sprayerId: import.meta.env.VITE_DEFAULT_SPRAYER_ID,
          dryMaxPercent: numberEnv(import.meta.env.VITE_DEFAULT_DRY_MAX_PERCENT, 40),
          wetMinPercent: numberEnv(import.meta.env.VITE_DEFAULT_WET_MIN_PERCENT, 80),
        }
      : null,
};

export function isPublicConfigured() {
  return publicAppConfig.appConfigured && publicAppConfig.firebaseConfigured;
}

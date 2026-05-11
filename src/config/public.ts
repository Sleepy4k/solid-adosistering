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

function numberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const publicAppConfig: PublicAppConfig = {
  appName: import.meta.env.VITE_APP_NAME ?? "Adosistering",
  appConfigured: import.meta.env.VITE_APP_CONFIGURED === "true",
  firebaseConfigured: Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_DATABASE_URL &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
  ),
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

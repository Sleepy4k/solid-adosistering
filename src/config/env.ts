export type PublicEnvStatus = {
  appConfigured: boolean;
  firebaseConfigured: boolean;
};

function hasPublicEnv(name: string) {
  return Boolean(import.meta.env[name]?.trim());
}

export function getPublicEnvStatus(): PublicEnvStatus {
  return {
    appConfigured: import.meta.env.VITE_APP_CONFIGURED === "true",
    firebaseConfigured:
      hasPublicEnv("VITE_FIREBASE_API_KEY") &&
      hasPublicEnv("VITE_FIREBASE_DATABASE_URL") &&
      hasPublicEnv("VITE_FIREBASE_PROJECT_ID") &&
      hasPublicEnv("VITE_FIREBASE_APP_ID"),
  };
}

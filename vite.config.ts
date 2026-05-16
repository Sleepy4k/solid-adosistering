import { solidStart } from "@solidjs/start/config";
import { nitroV2Plugin } from "@solidjs/vite-plugin-nitro-2";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

const serverEnvKeys = [
  "APP_ORIGIN",
  "DATABASE_URL",
  "EMAIL_FROM",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_DATABASE_URL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_SYNC_DISABLED",
  "SESSION_COOKIE_NAME",
  "SMTP_HOST",
  "SMTP_PASS",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const define = Object.fromEntries(
    serverEnvKeys.map((key) => [`process.env.${key}`, JSON.stringify(env[key] ?? process.env[key] ?? "")]),
  );

  return {
    plugins: [
      solidStart({
        middleware: "./src/middleware/auth.ts",
      }),
      tailwindcss(),
      nitroV2Plugin({
        preset: env.SERVER_PRESET || process.env.SERVER_PRESET || "bun",
      }),
    ],
    optimizeDeps: { exclude: ["leaflet"] },
    environments: {
      ssr: {
        define,
      },
    },
  };
});

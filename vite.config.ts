import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";

process.noDeprecation = true;

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
    build: {
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          const message = warning.message ?? "";
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" &&
            message.includes('"use server"') &&
            message.includes("src/server/actions/index.ts")
          ) {
            return;
          }
          if (
            warning.code === "SOURCEMAP_ERROR" &&
            message.includes("Can't resolve original location of error") &&
            message.includes("src/server/actions/index.ts")
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
    },
    plugins: [
      solidStart({
        middleware: "./src/middleware/auth.ts",
        ssr: true,
      }),
      tailwindcss(),
    ],
    optimizeDeps: { exclude: ["leaflet"] },
    environments: {
      ssr: {
        define,
      },
    },
  };
});

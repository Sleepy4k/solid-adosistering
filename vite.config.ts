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
      target: "es2020",
      minify: "terser",
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1000,
      terserOptions: {
        format: { comments: false },
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
          pure_getters: true,
        },
        mangle: true,
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("lucide-solid")) return "vendor-icons";
            if (id.includes("solid-js") || id.includes("@solidjs")) return "vendor-solid";
            if (id.includes("nodemailer") || id.includes("@prisma") || id.includes("firebase")) return "vendor-server";
            return "vendor";
          },
        },
        onwarn(warning, defaultHandler) {
          const message = warning.message ?? "";
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" &&
            message.includes('"use server"') &&
            message.includes("src/server/actions/")
          ) {
            return;
          }
          if (
            warning.code === "SOURCEMAP_ERROR" &&
            message.includes("Can't resolve original location of error") &&
            message.includes("src/server/actions/")
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
      ssr: { define },
    },
  };
});

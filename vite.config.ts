import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

const FORBIDDEN_PUBLIC_ENV = /(PRIVATE|SECRET|PASSWORD|SMTP|DATABASE|SERVICE_ACCOUNT|CLIENT_EMAIL|SESSION_COOKIE)/i;

/**
 * Exact public keys exempt from FORBIDDEN_PUBLIC_ENV. The Firebase RTDB URL is a
 * public project identifier consumed by the browser client, while the server-only
 * credential is `FIREBASE_DATABASE_URL` (no `VITE_` prefix) and stays forbidden.
 */
const ALLOWED_PUBLIC_ENV: ReadonlySet<string> = new Set(["VITE_FIREBASE_DATABASE_URL"]);

/**
 * Vite inlines every `VITE_*` variable into the browser bundle. Refuse to build
 * when a server-only credential is prefixed with `VITE_` by mistake.
 */
function forbidSecretPublicEnv(): Plugin {
  return {
    name: "forbid-secret-public-env",
    apply: "build",
    configResolved(config) {
      const keys = new Set([...Object.keys(process.env), ...Object.keys(config.env)]);
      for (const key of keys) {
        if (key.startsWith("VITE_") && !ALLOWED_PUBLIC_ENV.has(key) && FORBIDDEN_PUBLIC_ENV.test(key)) {
          throw new Error(
            `Refusing to build: ${key} looks like a server secret but is exposed to the client. Remove the VITE_ prefix.`,
          );
        }
      }
    },
  };
}

export default defineConfig({
  server: {
    host: true,
    port: 3000,
  },
  build: {
    target: "es2022",
    minify: true,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    exclude: ["leaflet"],
  },
  plugins: [
    forbidSecretPublicEnv(),
    solidStart({
      middleware: "./src/middleware/auth.ts",
      ssr: true,
      serialization: {
        mode: "json",
      },
      serverFunctions: {
        onError: "./src/server/http/server-function-error.ts",
      },
    }),
    tailwindcss(),
    nitro({
      // The Admin SDK is CommonJS with circular package internals. Bundling it
      // with Rolldown breaks SDK_VERSION initialisation, so keep it as an
      // external production dependency and let Node resolve it at runtime.
      rolldownConfig: {
        external: ["firebase-admin", "firebase-admin/app", "firebase-admin/database"],
      },
    }),
  ],
});

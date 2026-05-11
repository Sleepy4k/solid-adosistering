import "dotenv/config";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  ssr: true,
  middleware: "./src/middleware.ts",
  server: {
    preset: process.env.SERVER_PRESET ?? "bun",
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ["leaflet"] },
  },
});

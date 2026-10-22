import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "bun --conditions=react-server prisma/seed.ts",
  },
  // `prisma generate` runs inside `build`, where the database URL may not be
  // set. `env()` would throw there; commands that connect still fail clearly.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

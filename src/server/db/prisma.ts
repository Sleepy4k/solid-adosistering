import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseConfigured, serverConfig } from "../config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  assertDatabaseConfigured();
  const databaseUrl = serverConfig.databaseUrl;
  if (!databaseUrl) throw new Error("DATABASE_URL is required before database access");
  const adapter = new PrismaMariaDb(databaseUrl);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    errorFormat: "minimal",
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

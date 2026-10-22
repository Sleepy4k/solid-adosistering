/**
 * Applies pending Prisma migrations as part of the release build.
 *
 * `prisma migrate deploy` alone is not enough for this project's production
 * history, so this wrapper first:
 *
 * 1. Baselines a database that was created without `_prisma_migrations`
 *    (for example from an SQL import) by marking the migrations whose objects
 *    already exist as applied. Anything that is not a clean prefix aborts.
 * 2. Recovers a BCNF migration that failed inside its column-width block.
 *    Nothing is added or dropped before that block finishes, so marking it
 *    rolled back and rerunning is safe.
 * 3. Refuses to start the BCNF migration while legacy values are too long for
 *    its narrower columns, listing the rows instead of failing midway.
 *
 * It finishes with a drift check against `prisma/schema.prisma`.
 *
 * Set SKIP_DB_MIGRATE=1 to build without a database (for example in CI).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import prismaClientPackage from "@prisma/client";
import dotenv from "dotenv";

const { PrismaClient } = prismaClientPackage;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");
const BCNF_MIGRATION = "20261021120000_bcnf_normalization";

/** Columns the BCNF migration narrows below the legacy VARCHAR(191). */
const NARROWED_COLUMNS = [
  ["user", "name", 100],
  ["user_detail", "whatsapp", 32],
  ["user_detail", "nickname", 100],
  ["user_detail", "gender", 32],
  ["user_detail", "alt_phone", 32],
  ["user_detail", "occupation", 120],
  ["user_detail", "domicile", 120],
  ["user_detail", "country", 100],
  ["user_detail", "province", 100],
  ["user_detail", "city", 100],
  ["user_detail", "postal_code", 20],
  ["user_detail", "device_username", 100],
  ["session", "token_hash", 64],
  ["password_reset_token", "token_hash", 64],
  ["region", "name", 100],
  ["block", "name", 100],
  ["sprayer", "hardware_id", 100],
  ["sprayer", "display_name", 100],
  ["map_layer", "name", 100],
  ["sensor_reading", "pump_status", 16],
  ["sensor_reading", "wind_direction", 100],
  ["irrigation_event", "firebase_date_key", 64],
  ["activity_log", "entity_type", 64],
  ["activity_log", "ip_address", 64],
  ["email_delivery", "provider", 32],
  ["contact_submission", "name", 100],
  ["contact_submission", "phone", 32],
  ["contact_submission", "user_type", 64],
  ["landing_testimonial", "role", 120],
];

/**
 * How to recognise each migration in a database that has no
 * `_prisma_migrations` table. The region-precision migration only re-applies
 * the initial column types, so it shares the initial fingerprint.
 */
const FINGERPRINTS = {
  "20260516233000_initial_snake_case": (s) => s.hasTable("user") && s.hasTable("sensor_reading"),
  "20260517103000_region_coordinate_precision": (s) => s.hasTable("user") && s.hasTable("sensor_reading"),
  "20260523100000_features_and_fixes": (s) =>
    s.hasTable("contact_submission") && s.hasColumn("region", "volume_divider"),
  "20260526042105_add_landing_cms_tables": (s) => s.hasTable("landing_testimonial"),
  "20260526050107_add_newsletter_subscriber": (s) => s.hasTable("newsletter_subscriber"),
  "20261020120000_security_hardening_and_indexes": (s) => s.hasTable("login_throttle"),
  [BCNF_MIGRATION]: (s) =>
    s.hasColumn("region", "dry_max_percent") &&
    s.hasTable("alert_notification_target") &&
    !s.hasColumn("sensor_reading", "block_id"),
  "20261021130000_drop_redundant_event_indexes": (s) =>
    s.hasTable("irrigation_event") && !s.hasIndex("irrigation_event", "irrigation_event_firebase_event_id_idx"),
  "20261021140000_newsletter_double_opt_in_and_drop_api_key": (s) => s.hasColumn("newsletter_subscriber", "status"),
};

const log = (message) => console.log(`[db:deploy] ${message}`);

function fail(message) {
  console.error(`\n[db:deploy] ${message}\n`);
  process.exit(1);
}

function prisma(args, { allowExitCodes = [0], quiet = false } = {}) {
  const local = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
  const [command, commandArgs] = existsSync(local) ? [local, args] : ["npx", ["prisma", ...args]];
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    env: process.env,
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (result.error) fail(`Could not run prisma ${args.join(" ")}: ${result.error.message}`);
  if (!allowExitCodes.includes(result.status)) {
    if (quiet) process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    fail(`prisma ${args.join(" ")} exited with code ${result.status}.`);
  }
  return result;
}

async function readSchema(db) {
  const rows = (sql) => db.$queryRawUnsafe(sql);
  const tables = new Set(
    (await rows("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()")).map(
      (r) => r.t,
    ),
  );
  const columns = new Set(
    (
      await rows(
        "SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()",
      )
    ).map((r) => `${r.t}.${r.c}`),
  );
  const indexes = new Set(
    (
      await rows(
        "SELECT DISTINCT table_name AS t, index_name AS i FROM information_schema.statistics WHERE table_schema = DATABASE()",
      )
    ).map((r) => `${r.t}.${r.i}`),
  );
  return {
    tableCount: tables.size,
    hasTable: (table) => tables.has(table),
    hasColumn: (table, column) => columns.has(`${table}.${column}`),
    hasIndex: (table, index) => indexes.has(`${table}.${index}`),
  };
}

async function readMigrationRows(db) {
  return db.$queryRawUnsafe(
    "SELECT migration_name AS name, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM _prisma_migrations",
  );
}

async function baseline(schema, migrations) {
  const applied = migrations.map((name) => {
    const fingerprint = FINGERPRINTS[name];
    if (!fingerprint) fail(`No baseline fingerprint for ${name}; baseline this database manually.`);
    return fingerprint(schema);
  });
  const count = applied.indexOf(false) === -1 ? applied.length : applied.indexOf(false);
  if (applied.slice(count).some(Boolean)) {
    fail(
      "The database has no _prisma_migrations table and its schema does not match a known migration prefix. " +
        "Baseline it manually with `prisma migrate resolve --applied <migration>` (see docs/deployment.md).",
    );
  }
  if (count === 0) {
    fail(
      "The database has tables but none match the initial migration. " +
        "Point DATABASE_URL at the application database or baseline it manually.",
    );
  }
  log(`No _prisma_migrations table; baselining ${count} migration(s) already present in the schema.`);
  for (const name of migrations.slice(0, count)) prisma(["migrate", "resolve", "--applied", name]);
}

async function assertNarrowedColumnsFit(db, schema) {
  const checks = NARROWED_COLUMNS.filter(([table, column]) => schema.hasColumn(table, column));
  const sql = checks
    .map(
      ([table, column, max]) =>
        `SELECT '${table}.${column}' AS col, ${max} AS max_chars, COUNT(*) AS too_long ` +
        `FROM \`${table}\` WHERE CHAR_LENGTH(\`${column}\`) > ${max}`,
    )
    .join(" UNION ALL ");
  const offenders = (await db.$queryRawUnsafe(sql)).filter((r) => Number(r.too_long) > 0);
  if (offenders.length === 0) return;
  const lines = offenders.map((r) => `  - ${r.col}: ${Number(r.too_long)} row(s) longer than ${r.max_chars} chars`);
  fail(
    `${BCNF_MIGRATION} would fail on legacy values that are too long for its narrower columns:\n` +
      `${lines.join("\n")}\n` +
      "No migration was started. Shorten these values (see docs/deployment.md, step 2), then redeploy.",
  );
}

async function main() {
  dotenv.config({ path: join(ROOT, ".env"), quiet: true });

  if (process.env.SKIP_DB_MIGRATE === "1") {
    log("SKIP_DB_MIGRATE=1, skipping database migrations.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    fail(
      "DATABASE_URL is not set, so pending migrations cannot be applied. " +
        "Set it for the build, or set SKIP_DB_MIGRATE=1 to build without migrating.",
    );
  }

  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(MIGRATIONS_DIR, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();

  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL), log: ["error"] });
  try {
    const schema = await readSchema(db);

    // An empty database needs no checks: `migrate deploy` builds it from scratch.
    if (schema.tableCount > 0) {
      if (!schema.hasTable("_prisma_migrations")) await baseline(schema, migrations);

      const rows = await readMigrationRows(db);
      for (const row of rows.filter((r) => !r.finishedAt && !r.rolledBackAt)) {
        if (row.name === BCNF_MIGRATION && !schema.hasColumn("region", "dry_max_percent")) {
          log(`${BCNF_MIGRATION} previously failed in its column-width block; marking it rolled back to retry.`);
          prisma(["migrate", "resolve", "--rolled-back", BCNF_MIGRATION]);
        } else {
          fail(
            `Migration ${row.name} previously failed partway through and cannot be retried automatically. ` +
              "Follow the recovery steps in docs/normalization.md (Irreversibility and rollback).",
          );
        }
      }

      const finished = new Set(rows.filter((r) => r.finishedAt && !r.rolledBackAt).map((r) => r.name));
      const pending = migrations.filter((name) => !finished.has(name));
      if (pending.length === 0) {
        log("Database is up to date; no pending migrations.");
      } else {
        log(`Pending migration(s): ${pending.join(", ")}`);
        if (pending.includes(BCNF_MIGRATION)) await assertNarrowedColumnsFit(db, schema);
      }
    }
  } finally {
    await db.$disconnect();
  }

  prisma(["migrate", "deploy"]);

  const diff = prisma(
    ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script", "--exit-code"],
    { allowExitCodes: [0, 2], quiet: true },
  );
  if (diff.status === 2) {
    console.warn(
      "[db:deploy] WARNING: the database schema differs from prisma/schema.prisma after migrating. " +
        "SQL that would reconcile it:\n" +
        diff.stdout,
    );
  } else {
    log("Database schema matches prisma/schema.prisma.");
  }
}

main().catch((error) => fail(error instanceof Error ? (error.stack ?? error.message) : String(error)));

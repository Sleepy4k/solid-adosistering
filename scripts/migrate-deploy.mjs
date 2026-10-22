/**
 * Applies pending Prisma migrations as part of the release build.
 *
 * `prisma migrate deploy` alone is not enough for this project's production
 * history, so this wrapper first reconciles `_prisma_migrations` with the
 * live schema, using the objects each migration creates and removes:
 *
 * 1. Pending migrations whose changes are already in the schema (applied with
 *    `prisma db push`, an SQL import, or by hand) are recorded as applied,
 *    including one that `migrate deploy` previously marked failed.
 * 2. A failed migration with none of its changes in the schema is marked
 *    rolled back and retried. Every migration's first non-idempotent statement
 *    creates a tracked object, so "nothing present" means nothing applied.
 * 3. A partially applied migration, or a later migration's objects appearing
 *    before an earlier one's, stops the build with the objects involved.
 * 4. The BCNF migration is not started while legacy values are too long for
 *    its narrower columns; the offending columns are listed instead.
 *
 * It finishes with a drift check against `prisma/schema.prisma`.
 *
 * Set SKIP_DB_MIGRATE=1 to build without a database (for example in CI).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
 * Objects each migration creates and removes, as `table:t`, `column:t.c`, or
 * `index:t.i`. Objects a later migration drops again are left out of
 * `creates`. The region-precision migration only re-applies column types, so
 * it has no objects and counts as applied once the initial migration is.
 */
export const MANIFESTS = {
  "20260516233000_initial_snake_case": {
    creates: [
      "table:user",
      "table:session",
      "table:password_reset_token",
      "table:region",
      "table:block",
      "table:sprayer",
      "table:admin_region_assignment",
      "table:user_region_assignment",
      "table:indicator_threshold",
      "table:sensor_reading",
      "table:irrigation_event",
      "table:map_layer",
      "table:activity_log",
      "table:alert_notification",
      "table:email_delivery",
      "table:system_setting",
      "table:user_detail",
    ],
  },
  "20260517103000_region_coordinate_precision": {},
  "20260523100000_features_and_fixes": {
    creates: [
      "column:region.volume_divider",
      "column:region.show_wind_direction",
      "column:region.show_auto_irrigation",
      "table:contact_submission",
      "index:contact_submission.contact_submission_created_at_idx",
      "index:contact_submission.contact_submission_is_read_idx",
    ],
  },
  "20260526042105_add_landing_cms_tables": {
    creates: ["table:landing_testimonial", "table:landing_location", "table:landing_partner"],
  },
  "20260526050107_add_newsletter_subscriber": {
    creates: ["table:newsletter_subscriber"],
  },
  "20261020120000_security_hardening_and_indexes": {
    creates: [
      "column:session.absolute_expires_at",
      "column:session.last_seen_at",
      "column:session.ip_address",
      "column:session.user_agent",
      "index:session.session_absolute_expires_at_idx",
      "index:session.session_last_seen_at_idx",
      "table:login_throttle",
      "index:sprayer.sprayer_block_id_is_active_idx",
      "index:sensor_reading.sensor_reading_recorded_at_idx",
      "index:irrigation_event.irrigation_event_sprayer_id_relay_ended_at_idx",
      "index:irrigation_event.irrigation_event_mode_started_at_idx",
      "index:activity_log.activity_log_created_at_idx",
      "index:activity_log.activity_log_entity_type_created_at_idx",
      "index:contact_submission.contact_submission_is_read_created_at_idx",
      "index:email_delivery.email_delivery_created_at_idx",
    ],
  },
  [BCNF_MIGRATION]: {
    creates: [
      "column:region.dry_max_percent",
      "column:region.wet_min_percent",
      "column:region.automatic_mode",
      "column:region.safety_timeout_min",
      "column:region.safety_timeout_max",
      "column:sensor_reading.source_key",
      "index:sensor_reading.sensor_reading_sprayer_id_source_key_key",
      "index:irrigation_event.irrigation_event_started_at_id_idx",
      "table:alert_notification_target",
      "column:user.deleted_at",
      "index:user.user_deleted_at_idx",
    ],
    removes: [
      "column:indicator_threshold.dry_max_percent",
      "column:indicator_threshold.wet_min_percent",
      "column:sensor_reading.block_id",
      "column:irrigation_event.block_id",
      "column:activity_log.block_id",
      "column:alert_notification.region_id",
      "column:alert_notification.block_id",
      "column:alert_notification.sprayer_id",
    ],
  },
  "20261021130000_drop_redundant_event_indexes": {
    removes: [
      "index:irrigation_event.irrigation_event_firebase_event_id_idx",
      "index:irrigation_event.irrigation_event_started_at_idx",
    ],
  },
  "20261021140000_newsletter_double_opt_in_and_drop_api_key": {
    creates: [
      "column:newsletter_subscriber.status",
      "column:newsletter_subscriber.confirmed_at",
      "column:newsletter_subscriber.confirmation_token_hash",
      "column:newsletter_subscriber.confirmation_expires_at",
      "column:newsletter_subscriber.last_confirmation_sent_at",
      "column:newsletter_subscriber.consent_source",
      "index:newsletter_subscriber.newsletter_subscriber_status_subscribed_at_idx",
      "index:newsletter_subscriber.newsletter_subscriber_confirmation_expires_at_idx",
      "index:newsletter_subscriber.newsletter_subscriber_confirmation_token_hash_idx",
    ],
    removes: [
      "column:newsletter_subscriber.is_active",
      "index:newsletter_subscriber.newsletter_subscriber_is_active_subscribed_at_idx",
      "column:user_detail.api_key",
      "index:user_detail.user_detail_api_key_key",
    ],
  },
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

export async function readSchema(db) {
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
    has: (object) => {
      const [kind, name] = object.split(":");
      return (kind === "table" ? tables : kind === "column" ? columns : indexes).has(name);
    },
  };
}

/**
 * `present` when every created object exists and every removed one is gone,
 * `absent` when no created object exists and every removed one remains,
 * otherwise `partial` with the objects that disagree with either state.
 * Migrations without a manifest are `unknown` and left to `migrate deploy`.
 */
export function migrationState(schema, name) {
  const manifest = MANIFESTS[name];
  if (!manifest) return { state: "unknown" };
  const { creates = [], removes = [] } = manifest;
  const created = creates.filter((object) => schema.has(object));
  const remaining = removes.filter((object) => schema.has(object));
  if (created.length === creates.length && remaining.length === 0) return { state: "present" };
  if (created.length === 0 && remaining.length === removes.length) return { state: "absent" };
  return {
    state: "partial",
    missing: creates.filter((object) => !schema.has(object)),
    leftover: remaining,
  };
}

async function readMigrationRows(db) {
  return db.$queryRawUnsafe(
    "SELECT migration_name AS name, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM _prisma_migrations",
  );
}

/**
 * Brings `_prisma_migrations` in line with the schema and returns the
 * migrations `migrate deploy` still has to run.
 */
function reconcile(schema, migrations, rows) {
  const finished = new Set(rows.filter((r) => r.finishedAt && !r.rolledBackAt).map((r) => r.name));
  const failed = new Set(rows.filter((r) => !r.finishedAt && !r.rolledBackAt).map((r) => r.name));
  const pending = migrations.filter((name) => !finished.has(name));
  const describe = ({ missing, leftover }) =>
    [
      missing.length ? `missing: ${missing.join(", ")}` : "",
      leftover.length ? `still present: ${leftover.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");

  // Record the leading pending migrations that are already in the schema.
  let next = 0;
  for (; next < pending.length; next++) {
    const name = pending[next];
    if (migrationState(schema, name).state !== "present") break;
    if (failed.has(name)) prisma(["migrate", "resolve", "--rolled-back", name]);
    log(`${name} is already in the schema (applied outside prisma migrate); recording it as applied.`);
    prisma(["migrate", "resolve", "--applied", name]);
  }
  const remaining = pending.slice(next);
  if (remaining.length === 0) return remaining;

  const [first, ...later] = remaining;
  const firstState = migrationState(schema, first);
  if (firstState.state === "partial") {
    fail(
      `Migration ${first} is only partly in the database (${describe(firstState)}). ` +
        "It cannot be applied or skipped automatically. Restore the backup, or finish or undo the listed " +
        "changes by hand and run `prisma migrate resolve` (see docs/normalization.md, Irreversibility and rollback).",
    );
  }
  if (first === migrations[0] && schema.tableCount > (schema.hasTable("_prisma_migrations") ? 1 : 0)) {
    fail(
      "The database has tables but not the initial migration's. " +
        "Point DATABASE_URL at the application database or baseline it manually.",
    );
  }
  for (const name of later) {
    const { creates = [] } = MANIFESTS[name] ?? {};
    const early = creates.filter((object) => schema.has(object));
    if (early.length) {
      fail(
        `Objects from ${name} (${early.join(", ")}) exist although the earlier migration ${first} is not applied. ` +
          "Reconcile the schema by hand before deploying.",
      );
    }
  }
  if (failed.has(first)) {
    if (firstState.state === "unknown") {
      fail(
        `Migration ${first} previously failed. Check how far it got, then run ` +
          "`prisma migrate resolve --rolled-back` or `--applied` for it (see docs/deployment.md).",
      );
    }
    log(`${first} previously failed before changing the schema; marking it rolled back to retry.`);
    prisma(["migrate", "resolve", "--rolled-back", first]);
  }
  return remaining;
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
      const rows = schema.hasTable("_prisma_migrations") ? await readMigrationRows(db) : [];
      const pending = reconcile(schema, migrations, rows);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error instanceof Error ? (error.stack ?? error.message) : String(error)));
}

import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface Migration {
  version: number;
  name: string;
  up(database: Database): void;
}

export class UnsupportedSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSchemaError";
  }
}

export const STUDIO_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial-domain-store",
    up(database) {
      database.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          json TEXT NOT NULL CHECK (json_valid(json))
        );
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          revision INTEGER NOT NULL CHECK (revision >= 1),
          json TEXT NOT NULL CHECK (json_valid(json))
        );
      `);
    },
  },
  {
    version: 2,
    name: "mock-identity-store",
    up(database) {
      database.exec(`
        CREATE TABLE identities (
          id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          json TEXT NOT NULL CHECK (json_valid(json))
        );
      `);
    },
  },
  {
    version: 3,
    name: "partitions-and-permission-grants",
    up(database) {
      database.exec(`
        CREATE TABLE partitions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          identity_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          isolation_profile TEXT NOT NULL,
          ephemeral INTEGER NOT NULL CHECK (ephemeral IN (0, 1)),
          schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
          json TEXT NOT NULL CHECK (json_valid(json))
        );
        CREATE INDEX partitions_owner ON partitions(project_id, identity_id);
        CREATE TABLE permission_grants (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          origin TEXT NOT NULL,
          identity_id TEXT NOT NULL,
          capability TEXT NOT NULL,
          navigation_generation INTEGER NOT NULL CHECK (navigation_generation >= 0),
          mode TEXT NOT NULL CHECK (mode IN ('native', 'simulated')),
          decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
          json TEXT NOT NULL CHECK (json_valid(json)),
          UNIQUE(project_id, origin, identity_id, capability, navigation_generation, mode)
        );
      `);
    },
  },
  {
    version: 4,
    name: "isolated-protocol-storage",
    up(database) {
      database.exec(`
        CREATE TABLE protocol_storage_entries (
          storage_kind TEXT NOT NULL CHECK (storage_kind IN ('device', 'cloud')),
          project_id TEXT NOT NULL,
          bot_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          partition_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          value_bytes INTEGER NOT NULL CHECK (value_bytes >= 0),
          PRIMARY KEY(storage_kind, project_id, bot_id, user_id, partition_id, key)
        );
        CREATE INDEX protocol_storage_scope ON protocol_storage_entries(
          storage_kind, project_id, bot_id, user_id, partition_id
        );
      `);
    },
  },
  {
    version: 5,
    name: "recent-projects",
    up(database) {
      database.exec(`
        CREATE TABLE recent_projects (
          project_id TEXT PRIMARY KEY,
          last_opened_at TEXT NOT NULL
        );
        CREATE INDEX recent_projects_order ON recent_projects(last_opened_at DESC);
      `);
    },
  },
  {
    version: 6,
    name: "reversible-legacy-import-journal",
    up(database) {
      database.exec(`
        CREATE TABLE legacy_imports (
          source_digest TEXT PRIMARY KEY CHECK (length(source_digest) = 64),
          status TEXT NOT NULL CHECK (status IN ('staged', 'completed')),
          started_at TEXT NOT NULL,
          completed_at TEXT,
          vault_refs_json TEXT NOT NULL CHECK (json_valid(vault_refs_json)),
          summary_json TEXT CHECK (summary_json IS NULL OR json_valid(summary_json))
        );
      `);
    },
  },
  {
    version: 7,
    name: "update-status",
    up(database) {
      database.exec(`
        CREATE TABLE update_status (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          revision INTEGER NOT NULL CHECK (revision >= 0),
          json TEXT NOT NULL CHECK (json_valid(json))
        );
      `);
    },
  },
];

export const latestSchemaVersion = STUDIO_MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
);

function hasTable(database: Database, name: string): boolean {
  const row = database
    .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== null && row !== undefined;
}

export function currentSchemaVersion(database: Database): number {
  if (!hasTable(database, "studio_meta")) return 0;
  const row = database
    .query("SELECT schema_version FROM studio_meta WHERE id = 1")
    .get() as { schema_version?: number } | null;
  return row?.schema_version ?? 0;
}

export interface MigrationOptions {
  databaseFile?: string;
  backupDirectory?: string;
}

function backupBeforeMigration(
  database: Database,
  version: number,
  options: MigrationOptions,
): void {
  const filename = options.databaseFile;
  if (!filename || filename === ":memory:" || version === 1) return;
  const directory =
    options.backupDirectory ?? join(dirname(filename), "backups");
  mkdirSync(directory, { recursive: true });
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const backup = join(
    directory,
    `${basename(filename)}.before-v${version}-${randomUUID()}.sqlite`,
  );
  copyFileSync(filename, backup);
}

export function applyMigrations(
  database: Database,
  migrations: readonly Migration[] = STUDIO_MIGRATIONS,
  options: MigrationOptions = {},
): void {
  const current = currentSchemaVersion(database);
  const latest = migrations.reduce(
    (max, migration) => Math.max(max, migration.version),
    0,
  );
  if (current > latest) {
    throw new UnsupportedSchemaError(
      `Database schema ${current} is newer than supported schema ${latest}; refusing to modify it.`,
    );
  }
  if (!hasTable(database, "migration_journal") && current !== 0) {
    throw new Error(
      "Database migration journal is missing; refusing to modify it.",
    );
  }
  if (current === 0 && !hasTable(database, "studio_meta")) {
    database.exec(`
      CREATE TABLE studio_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 0)
      );
      INSERT INTO studio_meta (id, schema_version, revision) VALUES (1, 0, 0);
    `);
  }
  if (!hasTable(database, "migration_journal")) {
    database.exec(`CREATE TABLE migration_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('started', 'applied', 'failed')),
      started_at TEXT NOT NULL,
      finished_at TEXT
    )`);
  }
  let appliedVersion = currentSchemaVersion(database);
  const ordered = [...migrations].sort(
    (left, right) => left.version - right.version,
  );
  for (const migration of ordered) {
    if (!Number.isSafeInteger(migration.version) || migration.version < 1) {
      throw new Error("Migration versions must be positive integers.");
    }
    if (migration.version <= appliedVersion) continue;
    if (migration.version !== appliedVersion + 1) {
      throw new Error(
        `Migration sequence gap before version ${migration.version}.`,
      );
    }
    backupBeforeMigration(database, migration.version, options);
    const startedAt = new Date().toISOString();
    const journal = database.query(
      "INSERT INTO migration_journal (version, name, status, started_at) VALUES (?, ?, 'started', ?)",
    );
    const journalId = Number(
      journal.run(migration.version, migration.name, startedAt).lastInsertRowid,
    );
    try {
      database
        .transaction(() => {
          migration.up(database);
          database
            .query("UPDATE studio_meta SET schema_version = ? WHERE id = 1")
            .run(migration.version);
          database
            .query(
              "UPDATE migration_journal SET status = 'applied', finished_at = ? WHERE id = ?",
            )
            .run(new Date().toISOString(), journalId);
        })
        .immediate();
      appliedVersion = migration.version;
    } catch (error) {
      database
        .query(
          "UPDATE migration_journal SET status = 'failed', finished_at = ? WHERE id = ?",
        )
        .run(new Date().toISOString(), journalId);
      throw error;
    }
  }
}

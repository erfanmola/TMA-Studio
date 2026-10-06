import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Identity,
  PartitionRecord,
  PermissionGrant,
  Project,
  ProjectSnapshot,
  StudioSettings,
  UpdateStatusRecord,
} from "../../src/contracts/entities";
import type { RecentProject } from "../../src/contracts/home-service";
import {
  IdentitySchema,
  PartitionRecordSchema,
  PermissionGrantSchema,
  ProjectSchema,
  ProjectSnapshotSchema,
  StudioSettingsSchema,
  UpdateStatusRecordSchema,
  ValidationError,
} from "../../src/contracts/schemas";
import {
  applyMigrations,
  currentSchemaVersion,
  latestSchemaVersion,
  UnsupportedSchemaError,
} from "./migrations";

export interface StoreSnapshot {
  revision: number;
  projects: readonly Project[];
  settings: StudioSettings | null;
}

export interface StoreChange {
  revision: number;
  kind:
    | "project-created"
    | "project-updated"
    | "project-deleted"
    | "settings-updated"
    | "identity-created"
    | "identity-updated"
    | "identity-deleted"
    | "recent-project-opened"
    | "recent-project-removed"
    | "legacy-imported"
    | "bundle-imported"
    | "partition-created"
    | "partition-deleted"
    | "permission-grant-updated"
    | "update-status-recorded";
  // These changes invalidate host-owned runtime decisions and adapters.
  // They carry opaque record IDs only; renderer snapshots never include grants.
  projectId?: string;
  identityId?: string;
  partitionId?: string;
  permissionGrantId?: string;
}

export interface ProtocolStorageScope {
  projectId: string;
  botId: string;
  userId: string;
  partitionId: string;
}

export type ProtocolStorageKind = "device" | "cloud";

export class ProtocolStorageQuotaError extends Error {
  constructor() {
    super("Protocol storage quota exceeded.");
    this.name = "ProtocolStorageQuotaError";
  }
}

export class ProtocolStorageInputError extends Error {
  constructor() {
    super("Protocol storage input is invalid.");
    this.name = "ProtocolStorageInputError";
  }
}

export class StoreConflictError extends Error {
  constructor(message = "The record changed since it was loaded.") {
    super(message);
    this.name = "StoreConflictError";
  }
}

export class StoreNotFoundError extends Error {
  constructor(message = "The requested record does not exist.") {
    super(message);
    this.name = "StoreNotFoundError";
  }
}

type Listener = (change: StoreChange) => void;

export interface SnapshotSubscription {
  snapshot: StoreSnapshot;
  unsubscribe(): void;
}

export interface RevisionSubscription extends SnapshotSubscription {
  gap: boolean;
}

export interface LegacyImportSummary {
  projects: number;
  identities: number;
  tokens: number;
  warnings: number;
}

export interface LegacyImportRecord {
  status: "staged" | "completed";
  vaultReferences: string[];
  summary?: LegacyImportSummary;
}

export interface LegacyImportCommit {
  alreadyImported: boolean;
  preferencesImported: boolean;
  revision: number;
  summary: LegacyImportSummary;
}

function jsonRecord<T>(json: string, schema: { parse(value: unknown): T }): T {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ValidationError("Stored record is not valid JSON.");
  }
  return schema.parse(value);
}

export class StudioStore {
  private readonly database: Database;
  private readonly listeners = new Set<Listener>();
  private readonly queuedChanges: StoreChange[] = [];
  private notifying = false;
  private closed = false;
  private writing = false;

  constructor(
    readonly databaseFile = ":memory:",
    options: { backupDirectory?: string } = {},
  ) {
    if (databaseFile !== ":memory:")
      mkdirSync(dirname(databaseFile), { recursive: true });
    this.database = new Database(databaseFile, { create: true, strict: true });
    try {
      const schemaVersion = currentSchemaVersion(this.database);
      if (schemaVersion > latestSchemaVersion) {
        throw new UnsupportedSchemaError(
          `Database schema ${schemaVersion} is newer than this application; refusing to modify it.`,
        );
      }
      this.database.exec("PRAGMA busy_timeout = 5000");
      this.database.exec("PRAGMA foreign_keys = ON");
      this.database.exec("PRAGMA journal_mode = WAL");
      this.database.exec("PRAGMA synchronous = FULL");
      applyMigrations(this.database, undefined, { databaseFile, ...options });
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  getSnapshot(): StoreSnapshot {
    this.assertOpen();
    return this.database.transaction(() => this.readSnapshot()).deferred();
  }

  listRecentProjects(): RecentProject[] {
    this.assertOpen();
    const rows = this.database
      .query(`SELECT recent.project_id, recent.last_opened_at, projects.json
        FROM recent_projects AS recent
        LEFT JOIN projects ON projects.id = recent.project_id
        ORDER BY recent.last_opened_at DESC, recent.project_id
        LIMIT 20`)
      .all() as {
      project_id: string;
      last_opened_at: string;
      json: string | null;
    }[];
    return rows.map((row) => {
      if (!row.json)
        return {
          id: row.project_id,
          lastOpenedAt: row.last_opened_at,
          status: "missing",
        };
      const project = jsonRecord(row.json, ProjectSchema);
      return {
        id: project.id,
        lastOpenedAt: row.last_opened_at,
        status: "available",
        name: project.name,
        url: project.url,
        avatarColorIndex: project.avatarColorIndex,
      };
    });
  }

  markRecentProject(
    projectId: string,
    lastOpenedAt = new Date().toISOString(),
  ): void {
    this.assertOpen();
    this.write(() => {
      if (
        !this.database
          .query("SELECT 1 FROM projects WHERE id = ?")
          .get(projectId)
      ) {
        throw new StoreNotFoundError("Project not found.");
      }
      this.database
        .query(`INSERT INTO recent_projects(project_id, last_opened_at)
          VALUES (?, ?)
          ON CONFLICT(project_id) DO UPDATE SET last_opened_at = excluded.last_opened_at`)
        .run(projectId, lastOpenedAt);
      this.database
        .query(`DELETE FROM recent_projects WHERE project_id IN (
          SELECT project_id FROM recent_projects
          ORDER BY last_opened_at DESC, project_id LIMIT -1 OFFSET 20
        )`)
        .run();
      const revision = this.nextGlobalRevision();
      this.setGlobalRevision(revision);
      return {
        value: undefined,
        change: { revision, kind: "recent-project-opened", projectId },
      };
    });
  }

  removeRecentProject(projectId: string): boolean {
    this.assertOpen();
    return this.write(() => {
      const changes = this.database
        .query("DELETE FROM recent_projects WHERE project_id = ?")
        .run(projectId).changes;
      const revision = this.nextGlobalRevision();
      this.setGlobalRevision(revision);
      return {
        value: changes > 0,
        change: { revision, kind: "recent-project-removed", projectId },
      };
    });
  }

  getProject(projectId: string): ProjectSnapshot {
    this.assertOpen();
    return this.database
      .transaction(() => {
        const row = this.database
          .query("SELECT json FROM projects WHERE id = ?")
          .get(projectId) as { json: string } | null;
        if (!row) throw new StoreNotFoundError("Project not found.");
        const revision = this.database
          .query("SELECT revision FROM studio_meta WHERE id = 1")
          .get() as { revision: number } | null;
        if (!revision) throw new Error("Studio database metadata is missing.");
        return ProjectSnapshotSchema.parse({
          project: jsonRecord(row.json, ProjectSchema),
          account: null,
          revision: revision.revision,
        });
      })
      .deferred();
  }

  listIdentities(): Identity[] {
    this.assertOpen();
    const rows = this.database
      .query("SELECT json FROM identities ORDER BY rowid")
      .all() as { json: string }[];
    return rows.map(({ json }) => jsonRecord(json, IdentitySchema));
  }

  getIdentity(identityId: string): Identity {
    this.assertOpen();
    const row = this.database
      .query("SELECT json FROM identities WHERE id = ?")
      .get(identityId) as { json: string } | null;
    if (!row) throw new StoreNotFoundError("Identity not found.");
    return jsonRecord(row.json, IdentitySchema);
  }

  listPartitions(): PartitionRecord[] {
    this.assertOpen();
    const rows = this.database
      .query("SELECT json FROM partitions ORDER BY rowid")
      .all() as { json: string }[];
    return rows.map(({ json }) => jsonRecord(json, PartitionRecordSchema));
  }

  getPartition(partitionId: string): PartitionRecord | null {
    this.assertOpen();
    const row = this.database
      .query("SELECT json FROM partitions WHERE id = ?")
      .get(partitionId) as { json: string } | null;
    return row ? jsonRecord(row.json, PartitionRecordSchema) : null;
  }

  putPartition(input: PartitionRecord): PartitionRecord {
    this.assertOpen();
    const partition = PartitionRecordSchema.parse(input);
    return this.write(() => {
      const revision = this.nextGlobalRevision();
      this.database
        .query(`INSERT INTO partitions
        (id, project_id, identity_id, platform, isolation_profile, ephemeral, schema_version, json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,
        identity_id=excluded.identity_id, platform=excluded.platform,
        isolation_profile=excluded.isolation_profile, ephemeral=excluded.ephemeral,
        schema_version=excluded.schema_version, json=excluded.json`)
        .run(
          partition.id,
          partition.projectId,
          partition.identityId,
          partition.platform,
          partition.isolationProfile,
          partition.ephemeral ? 1 : 0,
          partition.schemaVersion,
          JSON.stringify(partition),
        );
      this.setGlobalRevision(revision);
      return {
        value: partition,
        change: {
          revision,
          kind: "partition-created",
          partitionId: partition.id,
        } as const,
      };
    });
  }

  deletePartition(partitionId: string): boolean {
    this.assertOpen();
    return this.write(() => {
      const owner = this.database
        .query("SELECT project_id, identity_id FROM partitions WHERE id = ?")
        .get(partitionId) as { project_id: string; identity_id: string } | null;
      if (!owner) {
        const revision = this.nextGlobalRevision();
        this.setGlobalRevision(revision);
        return {
          value: false,
          change: { revision, kind: "partition-deleted", partitionId } as const,
        };
      }
      this.database
        .query("DELETE FROM partitions WHERE id = ?")
        .run(partitionId);
      const revision = this.nextGlobalRevision();
      this.setGlobalRevision(revision);
      this.database
        .query(
          "DELETE FROM permission_grants WHERE project_id = ? AND identity_id = ?",
        )
        .run(owner.project_id, owner.identity_id);
      this.database
        .query("DELETE FROM protocol_storage_entries WHERE partition_id = ?")
        .run(partitionId);
      return {
        value: true,
        change: { revision, kind: "partition-deleted", partitionId } as const,
      };
    });
  }

  getProtocolStorageValue(
    kind: ProtocolStorageKind,
    scope: ProtocolStorageScope,
    key: string,
  ): string | null {
    this.assertOpen();
    const row = this.database
      .query(`SELECT value FROM protocol_storage_entries WHERE storage_kind=?
      AND project_id=? AND bot_id=? AND user_id=? AND partition_id=? AND key=?`)
      .get(
        kind,
        scope.projectId,
        scope.botId,
        scope.userId,
        scope.partitionId,
        key,
      ) as { value: string } | null;
    return row?.value ?? null;
  }

  listProtocolStorageKeys(
    kind: ProtocolStorageKind,
    scope: ProtocolStorageScope,
  ): string[] {
    this.assertOpen();
    const rows = this.database
      .query(`SELECT key FROM protocol_storage_entries WHERE storage_kind=?
      AND project_id=? AND bot_id=? AND user_id=? AND partition_id=? ORDER BY key`)
      .all(
        kind,
        scope.projectId,
        scope.botId,
        scope.userId,
        scope.partitionId,
      ) as {
      key: string;
    }[];
    return rows.map((row) => row.key);
  }

  setProtocolStorageValue(
    kind: ProtocolStorageKind,
    scope: ProtocolStorageScope,
    key: string,
    value: string | null,
  ): void {
    this.assertOpen();
    if (
      !validProtocolStorageScope(scope) ||
      !validProtocolStorageKey(kind, key) ||
      (value !== null && typeof value !== "string")
    )
      throw new ProtocolStorageInputError();
    const transaction = this.database.transaction(() => {
      if (value === null) {
        this.database
          .query(`DELETE FROM protocol_storage_entries WHERE storage_kind=?
          AND project_id=? AND bot_id=? AND user_id=? AND partition_id=? AND key=?`)
          .run(
            kind,
            scope.projectId,
            scope.botId,
            scope.userId,
            scope.partitionId,
            key,
          );
        return;
      }
      const valueBytes = new TextEncoder().encode(value).byteLength;
      if (kind === "device") {
        if (valueBytes > 60 * 1024) throw new ProtocolStorageQuotaError();
        const current = this.database
          .query(`SELECT COALESCE(SUM(value_bytes), 0) AS bytes FROM protocol_storage_entries
          WHERE storage_kind='device' AND project_id=? AND bot_id=? AND user_id=? AND partition_id=?`)
          .get(
            scope.projectId,
            scope.botId,
            scope.userId,
            scope.partitionId,
          ) as { bytes: number };
        const previous = this.database
          .query(`SELECT value_bytes FROM protocol_storage_entries WHERE storage_kind='device'
          AND project_id=? AND bot_id=? AND user_id=? AND partition_id=? AND key=?`)
          .get(
            scope.projectId,
            scope.botId,
            scope.userId,
            scope.partitionId,
            key,
          ) as { value_bytes: number } | null;
        if (
          current.bytes - (previous?.value_bytes ?? 0) + valueBytes >
          5 * 1024 * 1024
        )
          throw new ProtocolStorageQuotaError();
      } else {
        if (value.length > 4096) throw new ProtocolStorageQuotaError();
        const exists = this.database
          .query(`SELECT 1 FROM protocol_storage_entries WHERE storage_kind='cloud'
          AND project_id=? AND bot_id=? AND user_id=? AND partition_id=? AND key=?`)
          .get(
            scope.projectId,
            scope.botId,
            scope.userId,
            scope.partitionId,
            key,
          );
        const count = this.database
          .query(`SELECT COUNT(*) AS count FROM protocol_storage_entries WHERE storage_kind='cloud'
          AND project_id=? AND bot_id=? AND user_id=? AND partition_id=?`)
          .get(
            scope.projectId,
            scope.botId,
            scope.userId,
            scope.partitionId,
          ) as { count: number };
        if (!exists && count.count >= 1024)
          throw new ProtocolStorageQuotaError();
      }
      this.database
        .query(`INSERT INTO protocol_storage_entries
        (storage_kind, project_id, bot_id, user_id, partition_id, key, value, value_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(storage_kind, project_id, bot_id, user_id, partition_id, key)
        DO UPDATE SET value=excluded.value, value_bytes=excluded.value_bytes`)
        .run(
          kind,
          scope.projectId,
          scope.botId,
          scope.userId,
          scope.partitionId,
          key,
          value,
          valueBytes,
        );
    });
    transaction.immediate();
  }

  clearProtocolStorage(
    kind: ProtocolStorageKind,
    scope: ProtocolStorageScope,
  ): number {
    this.assertOpen();
    return this.database
      .query(`DELETE FROM protocol_storage_entries WHERE storage_kind=?
      AND project_id=? AND bot_id=? AND user_id=? AND partition_id=?`)
      .run(kind, scope.projectId, scope.botId, scope.userId, scope.partitionId)
      .changes;
  }

  getPermissionGrant(
    key: Pick<
      PermissionGrant,
      | "projectId"
      | "origin"
      | "identityId"
      | "capability"
      | "navigationGeneration"
      | "mode"
    >,
  ): PermissionGrant | null {
    this.assertOpen();
    const row = this.database
      .query(`SELECT json FROM permission_grants WHERE
      project_id=? AND origin=? AND identity_id=? AND capability=? AND navigation_generation=? AND mode=?`)
      .get(
        key.projectId,
        key.origin,
        key.identityId,
        key.capability,
        key.navigationGeneration,
        key.mode,
      ) as { json: string } | null;
    return row ? jsonRecord(row.json, PermissionGrantSchema) : null;
  }

  putPermissionGrant(input: PermissionGrant): PermissionGrant {
    this.assertOpen();
    const grant = PermissionGrantSchema.parse(input);
    return this.write(() => {
      this.database
        .query(`INSERT INTO permission_grants
        (id, project_id, origin, identity_id, capability, navigation_generation, mode, decision, json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, origin, identity_id, capability, navigation_generation, mode)
        DO UPDATE SET id=excluded.id, decision=excluded.decision, json=excluded.json`)
        .run(
          grant.id,
          grant.projectId,
          grant.origin,
          grant.identityId,
          grant.capability,
          grant.navigationGeneration,
          grant.mode,
          grant.decision,
          JSON.stringify(grant),
        );
      const revision = this.nextGlobalRevision();
      this.setGlobalRevision(revision);
      return {
        value: grant,
        change: {
          revision,
          kind: "permission-grant-updated",
          permissionGrantId: grant.id,
        } as const,
      };
    });
  }

  clearPermissionGrants(
    projectId: string,
    origin: string,
    identityId: string,
  ): number {
    this.assertOpen();
    let removed = 0;
    this.write(() => {
      removed = this.database
        .query(
          "DELETE FROM permission_grants WHERE project_id=? AND origin=? AND identity_id=?",
        )
        .run(projectId, origin, identityId).changes;
      const revision = this.nextGlobalRevision();
      this.setGlobalRevision(revision);
      return {
        value: removed,
        change: { revision, kind: "permission-grant-updated" } as const,
      };
    });
    return removed;
  }

  listProjectReferences(
    identityId: string,
  ): Pick<Project, "id" | "name" | "identityId">[] {
    this.assertOpen();
    const rows = this.database
      .query("SELECT json FROM projects ORDER BY rowid")
      .all() as { json: string }[];
    return rows
      .map(({ json }) => jsonRecord(json, ProjectSchema))
      .filter((project) => project.identityId === identityId)
      .map(({ id, name, identityId: currentIdentityId }) => ({
        id,
        name,
        identityId: currentIdentityId,
      }));
  }

  createIdentity(input: Identity): Identity {
    this.assertOpen();
    const identity = IdentitySchema.parse(input);
    return this.write(() => {
      if (
        this.database
          .query("SELECT 1 FROM identities WHERE id = ?")
          .get(identity.id)
      ) {
        throw new StoreConflictError(
          "An identity with this ID already exists.",
        );
      }
      const created = IdentitySchema.parse({ ...identity, revision: 1 });
      const revision = this.nextGlobalRevision();
      this.database
        .query("INSERT INTO identities (id, revision, json) VALUES (?, ?, ?)")
        .run(created.id, created.revision, JSON.stringify(created));
      this.setGlobalRevision(revision);
      return {
        value: created,
        change: {
          revision,
          kind: "identity-created",
          identityId: created.id,
        } as const,
      };
    });
  }

  updateMockIdentity(
    identityId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<
        Extract<Identity, { kind: "mock" }>,
        | "telegramId"
        | "firstName"
        | "lastName"
        | "username"
        | "languageCode"
        | "isPremium"
        | "photoUrl"
      >
    >,
  ): Extract<Identity, { kind: "mock" }> {
    this.assertOpen();
    return this.write(() => {
      const row = this.database
        .query("SELECT json FROM identities WHERE id = ?")
        .get(identityId) as { json: string } | null;
      if (!row) throw new StoreNotFoundError("Identity not found.");
      const current = jsonRecord(row.json, IdentitySchema);
      if (current.kind !== "mock")
        throw new StoreConflictError("Real identities are read-only.");
      if (current.revision !== expectedRevision) throw new StoreConflictError();
      const revision = this.nextGlobalRevision();
      const merged = Object.fromEntries(
        Object.entries({ ...current, ...patch }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      const updated = IdentitySchema.parse({
        ...merged,
        id: current.id,
        kind: "mock",
        revision: current.revision + 1,
      }) as Extract<Identity, { kind: "mock" }>;
      this.database
        .query(
          "UPDATE identities SET revision = ?, json = ? WHERE id = ? AND revision = ?",
        )
        .run(
          updated.revision,
          JSON.stringify(updated),
          identityId,
          expectedRevision,
        );
      this.setGlobalRevision(revision);
      return {
        value: updated,
        change: { revision, kind: "identity-updated", identityId } as const,
      };
    });
  }

  updateTelegramIdentity(
    identityId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<
        Extract<Identity, { kind: "telegram" }>,
        "profile" | "refreshedAt" | "status"
      >
    >,
  ): Extract<Identity, { kind: "telegram" }> {
    this.assertOpen();
    return this.write(() => {
      const row = this.database
        .query("SELECT json FROM identities WHERE id = ?")
        .get(identityId) as { json: string } | null;
      if (!row) throw new StoreNotFoundError("Identity not found.");
      const current = jsonRecord(row.json, IdentitySchema);
      if (current.kind !== "telegram")
        throw new StoreConflictError(
          "Mock identities cannot receive Telegram refreshes.",
        );
      if (current.revision !== expectedRevision) throw new StoreConflictError();
      const updated = IdentitySchema.parse({
        ...current,
        ...patch,
        id: current.id,
        kind: "telegram",
        revision: current.revision + 1,
      }) as Extract<Identity, { kind: "telegram" }>;
      const revision = this.nextGlobalRevision();
      this.database
        .query(
          "UPDATE identities SET revision = ?, json = ? WHERE id = ? AND revision = ?",
        )
        .run(
          updated.revision,
          JSON.stringify(updated),
          identityId,
          expectedRevision,
        );
      this.setGlobalRevision(revision);
      return {
        value: updated,
        change: { revision, kind: "identity-updated", identityId } as const,
      };
    });
  }

  deleteMockIdentity(
    identityId: string,
    expectedRevision: number,
    reassignToId?: string,
  ): void {
    this.assertOpen();
    this.write(() => {
      const row = this.database
        .query("SELECT json FROM identities WHERE id = ?")
        .get(identityId) as { json: string } | null;
      if (!row) throw new StoreNotFoundError("Identity not found.");
      const identity = jsonRecord(row.json, IdentitySchema);
      if (identity.kind !== "mock")
        throw new StoreConflictError("Real identities cannot be deleted here.");
      if (identity.revision !== expectedRevision)
        throw new StoreConflictError();
      const references = this.listProjectReferences(identityId);
      let replacement: Identity | undefined;
      if (references.length > 0) {
        if (!reassignToId || reassignToId === identityId) {
          throw new StoreConflictError(
            "Choose another identity before deleting this user.",
          );
        }
        replacement = this.getIdentity(reassignToId);
      }
      const revision = this.nextGlobalRevision();
      if (replacement) {
        const projectRows = this.database
          .query("SELECT id, revision, json FROM projects")
          .all() as { id: string; revision: number; json: string }[];
        const updateProject = this.database.query(
          "UPDATE projects SET revision = ?, json = ? WHERE id = ? AND revision = ?",
        );
        for (const projectRow of projectRows) {
          const project = jsonRecord(projectRow.json, ProjectSchema);
          if (project.identityId !== identityId) continue;
          const reassigned = ProjectSchema.parse({
            ...project,
            identityId: replacement.id,
            updatedAt: new Date().toISOString(),
            revision: project.revision + 1,
          });
          updateProject.run(
            reassigned.revision,
            JSON.stringify(reassigned),
            project.id,
            projectRow.revision,
          );
        }
      }
      this.database
        .query("DELETE FROM identities WHERE id = ?")
        .run(identityId);
      this.setGlobalRevision(revision);
      return {
        value: undefined,
        change: { revision, kind: "identity-deleted", identityId } as const,
      };
    });
  }

  createProject(input: Project): Project {
    this.assertOpen();
    const project = ProjectSchema.parse(input);
    const result = this.write(() => {
      if (
        this.database
          .query("SELECT 1 FROM projects WHERE id = ?")
          .get(project.id)
      ) {
        throw new StoreConflictError("A project with this ID already exists.");
      }
      const nextRevision = this.nextGlobalRevision();
      const created = ProjectSchema.parse({ ...project, revision: 1 });
      this.database
        .query("INSERT INTO projects (id, revision, json) VALUES (?, ?, ?)")
        .run(created.id, created.revision, JSON.stringify(created));
      this.setGlobalRevision(nextRevision);
      return {
        value: created,
        change: {
          revision: nextRevision,
          kind: "project-created",
          projectId: created.id,
        } as const,
      };
    });
    return result;
  }

  importProjectBundle(
    input: {
      identities: Extract<Identity, { kind: "mock" }>[];
      projects: Project[];
    },
    newId: () => string,
  ): {
    projectCount: number;
    identityCount: number;
    remappedProjectCount: number;
    reusedIdentityCount: number;
  } {
    this.assertOpen();
    const incomingIdentities = input.identities.map((identity) => {
      const parsed = IdentitySchema.parse(identity);
      if (parsed.kind !== "mock")
        throw new ValidationError("Bundle identities must be mock profiles.");
      return parsed;
    });
    const incomingProjects = input.projects.map((project) => {
      const parsed = ProjectSchema.parse(project);
      if (
        parsed.botTokenRef ||
        (parsed.launch.kind === "mock" && parsed.launch.signing !== "unsigned")
      )
        throw new ValidationError("Project bundle cannot contain credentials.");
      return parsed;
    });
    return this.write(() => {
      const identitiesById = new Map(
        this.listIdentities().map((identity) => [identity.id, identity]),
      );
      const identityByTelegramId = new Map(
        [...identitiesById.values()]
          .filter((identity) => identity.kind === "mock")
          .map((identity) => [identity.telegramId, identity.id]),
      );
      const mappedIdentityIds = new Map<string, string>();
      let identityCount = 0;
      let reusedIdentityCount = 0;
      const insertIdentity = this.database.query(
        "INSERT INTO identities (id, revision, json) VALUES (?, ?, ?)",
      );
      for (const identity of incomingIdentities) {
        const duplicate = identityByTelegramId.get(identity.telegramId);
        if (duplicate) {
          mappedIdentityIds.set(identity.id, duplicate);
          reusedIdentityCount += 1;
          continue;
        }
        let id = identity.id;
        while (
          identitiesById.has(id) ||
          this.database.query("SELECT 1 FROM identities WHERE id=?").get(id)
        )
          id = newId();
        const created = IdentitySchema.parse({
          ...identity,
          id,
          revision: 1,
        }) as Extract<Identity, { kind: "mock" }>;
        insertIdentity.run(
          created.id,
          created.revision,
          JSON.stringify(created),
        );
        identitiesById.set(created.id, created);
        identityByTelegramId.set(created.telegramId, created.id);
        mappedIdentityIds.set(identity.id, created.id);
        identityCount += 1;
      }

      const existingProjectIds = new Set(
        (
          this.database.query("SELECT id FROM projects").all() as {
            id: string;
          }[]
        ).map(({ id }) => id),
      );
      const insertProject = this.database.query(
        "INSERT INTO projects (id, revision, json) VALUES (?, ?, ?)",
      );
      let remappedProjectCount = 0;
      for (const project of incomingProjects) {
        const identityId = mappedIdentityIds.get(project.identityId);
        if (!identityId)
          throw new ValidationError(
            "Every imported project must reference an included mock profile.",
          );
        let id = project.id;
        while (existingProjectIds.has(id)) id = newId();
        if (id !== project.id) remappedProjectCount += 1;
        const created = ProjectSchema.parse({
          ...project,
          id,
          identityId,
          revision: 1,
        });
        insertProject.run(
          created.id,
          created.revision,
          JSON.stringify(created),
        );
        existingProjectIds.add(created.id);
      }
      const revision = this.nextGlobalRevision();
      this.setGlobalRevision(revision);
      return {
        value: {
          projectCount: incomingProjects.length,
          identityCount,
          remappedProjectCount,
          reusedIdentityCount,
        },
        change: { revision, kind: "bundle-imported" as const },
      };
    });
  }

  updateProject(
    projectId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<
        Project,
        | "name"
        | "url"
        | "avatarColorIndex"
        | "botTokenRef"
        | "identityId"
        | "defaultMode"
        | "launch"
        | "splash"
      >
    >,
  ): Project {
    this.assertOpen();
    const result = this.write(() => {
      const row = this.database
        .query("SELECT json FROM projects WHERE id = ?")
        .get(projectId) as { json: string } | null;
      if (!row) throw new StoreNotFoundError("Project not found.");
      const current = jsonRecord(row.json, ProjectSchema);
      if (current.revision !== expectedRevision) throw new StoreConflictError();
      const revision = this.nextGlobalRevision();
      // An explicit undefined in the patch clears an optional field.
      const merged = Object.fromEntries(
        Object.entries({ ...current, ...patch }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      const updated = ProjectSchema.parse({
        ...merged,
        updatedAt: new Date().toISOString(),
        revision: current.revision + 1,
      });
      if (
        current.identityId !== updated.identityId ||
        new URL(current.url).origin !== new URL(updated.url).origin
      ) {
        this.database
          .query("DELETE FROM permission_grants WHERE project_id = ?")
          .run(projectId);
      }
      this.database
        .query(
          "UPDATE projects SET revision = ?, json = ? WHERE id = ? AND revision = ?",
        )
        .run(
          updated.revision,
          JSON.stringify(updated),
          projectId,
          expectedRevision,
        );
      this.setGlobalRevision(revision);
      return {
        value: updated,
        change: { revision, kind: "project-updated", projectId } as const,
      };
    });
    return result;
  }

  deleteProject(projectId: string, expectedRevision: number): void {
    this.assertOpen();
    this.write(() => {
      const row = this.database
        .query("SELECT revision FROM projects WHERE id = ?")
        .get(projectId) as { revision: number } | null;
      if (!row) throw new StoreNotFoundError("Project not found.");
      if (row.revision !== expectedRevision) throw new StoreConflictError();
      const revision = this.nextGlobalRevision();
      this.database
        .query("DELETE FROM projects WHERE id = ? AND revision = ?")
        .run(projectId, expectedRevision);
      this.database
        .query("DELETE FROM protocol_storage_entries WHERE project_id = ?")
        .run(projectId);
      this.setGlobalRevision(revision);
      return {
        value: undefined,
        change: { revision, kind: "project-deleted", projectId } as const,
      };
    });
  }

  updateSettings(
    input: StudioSettings,
    expectedRevision: number,
  ): StudioSettings {
    this.assertOpen();
    const requested = StudioSettingsSchema.parse(input);
    return this.write(() => {
      const row = this.database
        .query("SELECT revision FROM settings WHERE id = 1")
        .get() as { revision: number } | null;
      const currentRevision = row?.revision ?? 0;
      if (currentRevision !== expectedRevision) throw new StoreConflictError();
      const revision = this.nextGlobalRevision();
      const settings = StudioSettingsSchema.parse({ ...requested, revision });
      this.database
        .query(`INSERT INTO settings (id, revision, json) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, json = excluded.json`)
        .run(settings.revision, JSON.stringify(settings));
      this.setGlobalRevision(revision);
      return {
        value: settings,
        change: { revision, kind: "settings-updated" } as const,
      };
    });
  }

  getUpdateStatus(): UpdateStatusRecord | null {
    this.assertOpen();
    const row = this.database
      .query("SELECT revision, json FROM update_status WHERE id = 1")
      .get() as { revision: number; json: string } | null;
    if (!row) return null;
    const record = jsonRecord(row.json, UpdateStatusRecordSchema);
    return { ...record, revision: row.revision };
  }

  saveUpdateStatus(
    input: UpdateStatusRecord,
    expectedRevision: number,
  ): UpdateStatusRecord {
    this.assertOpen();
    const requested = UpdateStatusRecordSchema.parse(input);
    return this.write(() => {
      const row = this.database
        .query("SELECT revision FROM update_status WHERE id = 1")
        .get() as { revision: number } | null;
      const currentRevision = row?.revision ?? 0;
      if (currentRevision !== expectedRevision) throw new StoreConflictError();
      const revision = this.nextGlobalRevision();
      const record: UpdateStatusRecord = { ...requested, revision };
      this.database
        .query(`INSERT INTO update_status (id, revision, json) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, json = excluded.json`)
        .run(record.revision, JSON.stringify(record));
      this.setGlobalRevision(revision);
      return {
        value: record,
        change: { revision, kind: "update-status-recorded" } as const,
      };
    });
  }

  getLegacyImport(sourceDigest: string): LegacyImportRecord | null {
    this.assertOpen();
    if (!/^[0-9a-f]{64}$/u.test(sourceDigest))
      throw new ValidationError("Legacy import digest is invalid.");
    const row = this.database
      .query(
        "SELECT status, vault_refs_json, summary_json FROM legacy_imports WHERE source_digest = ?",
      )
      .get(sourceDigest) as {
      status: "staged" | "completed";
      vault_refs_json: string;
      summary_json: string | null;
    } | null;
    if (!row) return null;
    const vaultReferences = JSON.parse(row.vault_refs_json) as unknown;
    if (
      !Array.isArray(vaultReferences) ||
      !vaultReferences.every(
        (value) =>
          typeof value === "string" && /^vault:v1:[0-9a-f-]{36}$/u.test(value),
      )
    ) {
      throw new ValidationError("Legacy import journal is invalid.");
    }
    let summary: LegacyImportSummary | undefined;
    if (row.summary_json) {
      const parsed = JSON.parse(row.summary_json) as Record<string, unknown>;
      if (
        !Number.isSafeInteger(parsed.projects) ||
        !Number.isSafeInteger(parsed.identities) ||
        !Number.isSafeInteger(parsed.tokens) ||
        !Number.isSafeInteger(parsed.warnings)
      ) {
        throw new ValidationError("Legacy import summary is invalid.");
      }
      summary = parsed as unknown as LegacyImportSummary;
    }
    if (row.status === "completed" && !summary)
      throw new ValidationError("Completed legacy import has no summary.");
    return {
      status: row.status,
      vaultReferences,
      ...(summary ? { summary } : {}),
    };
  }

  beginLegacyImport(
    sourceDigest: string,
    startedAt: string,
    vaultReferences: readonly string[],
  ): LegacyImportRecord {
    this.assertOpen();
    if (!/^[0-9a-f]{64}$/u.test(sourceDigest))
      throw new ValidationError("Legacy import digest is invalid.");
    if (
      !Array.isArray(vaultReferences) ||
      !vaultReferences.every((reference) =>
        /^vault:v1:[0-9a-f-]{36}$/u.test(reference),
      ) ||
      new Set(vaultReferences).size !== vaultReferences.length
    ) {
      throw new ValidationError("Legacy import references are invalid.");
    }
    if (
      typeof startedAt !== "string" ||
      !Number.isFinite(Date.parse(startedAt))
    ) {
      throw new ValidationError("Legacy import start time is invalid.");
    }
    this.withQuietWrite(() => {
      this.database
        .query(
          `INSERT OR IGNORE INTO legacy_imports
            (source_digest, status, started_at, vault_refs_json)
          VALUES (?, 'staged', ?, ?)`,
        )
        .run(sourceDigest, startedAt, JSON.stringify(vaultReferences));
    });
    const current = this.getLegacyImport(sourceDigest);
    if (!current) throw new Error("Legacy import journal was not created.");
    return current;
  }

  completeLegacyImport(input: {
    sourceDigest: string;
    completedAt: string;
    identities: readonly Identity[];
    projects: readonly Project[];
    settings: StudioSettings | null;
    summary: LegacyImportSummary;
  }): LegacyImportCommit {
    this.assertOpen();
    const identities = input.identities.map((identity) =>
      IdentitySchema.parse(identity),
    );
    const projects = input.projects.map((project) =>
      ProjectSchema.parse(project),
    );
    const settings = input.settings
      ? StudioSettingsSchema.parse(input.settings)
      : null;
    const { summary } = input;
    if (
      !/^[0-9a-f]{64}$/u.test(input.sourceDigest) ||
      ![
        summary.projects,
        summary.identities,
        summary.tokens,
        summary.warnings,
      ].every((value) => Number.isSafeInteger(value) && value >= 0)
    ) {
      throw new ValidationError("Legacy import summary is invalid.");
    }
    if (
      typeof input.completedAt !== "string" ||
      !Number.isFinite(Date.parse(input.completedAt))
    ) {
      throw new ValidationError("Legacy import completion time is invalid.");
    }
    const result = this.write(() => {
      const row = this.database
        .query("SELECT status FROM legacy_imports WHERE source_digest = ?")
        .get(input.sourceDigest) as { status: "staged" | "completed" } | null;
      if (!row) throw new StoreNotFoundError("Legacy import was not staged.");
      if (row.status === "completed") {
        const completed = this.getLegacyImport(input.sourceDigest);
        if (!completed?.summary)
          throw new ValidationError("Completed legacy import has no summary.");
        const revisionRow = this.database
          .query("SELECT revision FROM studio_meta WHERE id = 1")
          .get() as { revision: number };
        return {
          value: {
            alreadyImported: true,
            preferencesImported: false,
            revision: revisionRow.revision,
            summary: completed.summary,
          },
          change: null,
        };
      }
      for (const identity of identities) {
        if (
          this.database
            .query("SELECT 1 FROM identities WHERE id = ?")
            .get(identity.id)
        ) {
          throw new StoreConflictError(
            "An imported identity ID already exists.",
          );
        }
      }
      for (const project of projects) {
        if (
          this.database
            .query("SELECT 1 FROM projects WHERE id = ?")
            .get(project.id)
        ) {
          throw new StoreConflictError(
            "An imported project ID already exists.",
          );
        }
      }
      const revision = this.nextGlobalRevision();
      for (const identity of identities) {
        this.database
          .query("INSERT INTO identities (id, revision, json) VALUES (?, ?, ?)")
          .run(identity.id, identity.revision, JSON.stringify(identity));
      }
      for (const project of projects) {
        this.database
          .query("INSERT INTO projects (id, revision, json) VALUES (?, ?, ?)")
          .run(project.id, project.revision, JSON.stringify(project));
      }
      let preferencesImported = false;
      if (
        settings &&
        !this.database.query("SELECT 1 FROM settings WHERE id = 1").get()
      ) {
        const importedSettings = StudioSettingsSchema.parse({
          ...settings,
          revision,
        });
        this.database
          .query("INSERT INTO settings (id, revision, json) VALUES (1, ?, ?)")
          .run(revision, JSON.stringify(importedSettings));
        preferencesImported = true;
      }
      this.database
        .query(
          `UPDATE legacy_imports SET status = 'completed', completed_at = ?,
            vault_refs_json = '[]', summary_json = ? WHERE source_digest = ? AND status = 'staged'`,
        )
        .run(input.completedAt, JSON.stringify(summary), input.sourceDigest);
      this.setGlobalRevision(revision);
      return {
        value: {
          alreadyImported: false,
          preferencesImported,
          revision,
          summary,
        },
        change: { revision, kind: "legacy-imported" } as const,
      };
    });
    return result;
  }

  snapshotAndSubscribe(listener: Listener): SnapshotSubscription {
    this.assertOpen();
    this.listeners.add(listener);
    try {
      return {
        snapshot: this.getSnapshot(),
        unsubscribe: () => this.listeners.delete(listener),
      };
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }
  }

  subscribeFrom(revision: number, listener: Listener): RevisionSubscription {
    this.assertOpen();
    const subscription = this.snapshotAndSubscribe(listener);
    return {
      ...subscription,
      gap: revision !== subscription.snapshot.revision,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.queuedChanges.length = 0;
    this.database.close();
  }

  private write<T>(
    operation: () => { value: T; change: StoreChange | null },
  ): T {
    this.assertOpen();
    if (this.writing)
      throw new StoreConflictError("A write is already in progress.");
    this.writing = true;
    try {
      const result = this.database.transaction(operation).immediate();
      this.writing = false;
      if (result.change) {
        this.queuedChanges.push(result.change);
        this.flushChanges();
      }
      return result.value;
    } finally {
      this.writing = false;
    }
  }

  private withQuietWrite<T>(operation: () => T): T {
    this.assertOpen();
    if (this.writing)
      throw new StoreConflictError("A write is already in progress.");
    this.writing = true;
    try {
      return this.database.transaction(operation).immediate();
    } finally {
      this.writing = false;
    }
  }

  private nextGlobalRevision(): number {
    const row = this.database
      .query("SELECT revision FROM studio_meta WHERE id = 1")
      .get() as { revision: number } | null;
    if (!row) throw new Error("Studio database metadata is missing.");
    return row.revision + 1;
  }

  private readSnapshot(): StoreSnapshot {
    const metadata = this.database
      .query("SELECT schema_version, revision FROM studio_meta WHERE id = 1")
      .get() as { schema_version: number; revision: number } | null;
    if (!metadata) throw new Error("Studio database metadata is missing.");
    if (metadata.schema_version > latestSchemaVersion) {
      throw new UnsupportedSchemaError(
        "Studio database schema is newer than this application.",
      );
    }
    const projects = this.database
      .query("SELECT json FROM projects ORDER BY rowid")
      .all() as { json: string }[];
    const settingsRow = this.database
      .query("SELECT json FROM settings WHERE id = 1")
      .get() as { json: string } | null;
    return {
      revision: metadata.revision,
      projects: projects.map(({ json }) => jsonRecord(json, ProjectSchema)),
      settings: settingsRow
        ? jsonRecord(settingsRow.json, StudioSettingsSchema)
        : null,
    };
  }

  private setGlobalRevision(revision: number): void {
    this.database
      .query("UPDATE studio_meta SET revision = ? WHERE id = 1")
      .run(revision);
  }

  private flushChanges(): void {
    if (this.notifying) return;
    this.notifying = true;
    try {
      while (this.queuedChanges.length > 0) {
        const change = this.queuedChanges.shift();
        if (!change) continue;
        for (const listener of [...this.listeners]) {
          try {
            listener(change);
          } catch {
            // A subscriber cannot roll back or obscure a committed database write.
          }
        }
      }
    } finally {
      this.notifying = false;
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Studio store is closed.");
  }
}

function validProtocolStorageScope(scope: ProtocolStorageScope): boolean {
  return [scope.projectId, scope.botId, scope.userId, scope.partitionId].every(
    (value) =>
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= 128 &&
      !Array.from(value).some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code < 32 || code === 127;
      }),
  );
}

function validProtocolStorageKey(
  kind: ProtocolStorageKind,
  key: string,
): boolean {
  if (typeof key !== "string" || key.length === 0 || key.length > 128)
    return false;
  if (kind === "cloud") return /^[A-Za-z0-9_-]+$/u.test(key);
  return !Array.from(key).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

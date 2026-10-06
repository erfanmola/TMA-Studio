import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMigrations,
  currentSchemaVersion,
  STUDIO_MIGRATIONS,
} from "../../apps/studio/bunium/services/migrations";
import { StudioStore } from "../../apps/studio/bunium/services/store";
import {
  HostUpdateStatusService,
  UpdateStatusServiceError,
} from "../../apps/studio/bunium/services/update-status";
import type { UpdateReleaseDescriptor } from "../../apps/studio/src/contracts/entities";
import { defaultSettings } from "../../apps/studio/src/contracts/settings-defaults";

const folders: string[] = [];
const temporaryFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), "tma-update-status-test-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

const release = (
  overrides: Partial<UpdateReleaseDescriptor> = {},
): UpdateReleaseDescriptor => ({
  sequence: 41,
  version: "0.0.7",
  channel: "stable",
  ...overrides,
});

const errorCode = (task: () => unknown): string => {
  try {
    task();
  } catch (error) {
    expect(error).toBeInstanceOf(UpdateStatusServiceError);
    return (error as UpdateStatusServiceError).code;
  }
  throw new Error("Expected the task to throw.");
};

describe("studio update status service", () => {
  test("fresh store reports no installed release or check", () => {
    const store = new StudioStore(":memory:");
    try {
      expect(store.getUpdateStatus()).toBeNull();
      const service = new HostUpdateStatusService(store, {
        now: () => "2026-10-06T00:00:00.000Z",
      });
      expect(service.status()).toEqual({
        revision: 0,
        installed: null,
        lastCheckAt: null,
        lastOutcome: null,
        pending: null,
      });
    } finally {
      store.close();
    }
  });

  test("records an installed release and round-trips it", () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store);
      const recorded = service.recordInstalled(release());
      expect(recorded.installed).toEqual(release());
      expect(recorded.revision).toBeGreaterThan(0);
      expect(store.getUpdateStatus()).toEqual(recorded);
      const newer = service.recordInstalled(release({ sequence: 42 }));
      expect(newer.installed?.sequence).toBe(42);
      expect(newer.revision).toBeGreaterThan(recorded.revision);
    } finally {
      store.close();
    }
  });

  test("rejects malformed installed releases without storing them", () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store);
      expect(
        errorCode(() => service.recordInstalled(release({ sequence: 0 }))),
      ).toBe("INVALID_INPUT");
      expect(
        errorCode(() => service.recordInstalled(release({ version: "" }))),
      ).toBe("INVALID_INPUT");
      expect(
        errorCode(() =>
          service.recordInstalled({ ...release(), extra: true } as never),
        ),
      ).toBe("INVALID_INPUT");
      expect(
        errorCode(() =>
          service.recordInstalled(release({ channel: "beta" as never })),
        ),
      ).toBe("INVALID_INPUT");
      expect(store.getUpdateStatus()).toBeNull();
    } finally {
      store.close();
    }
  });

  test("rejects rollback and same-sequence tampering, allows idempotent repeat", () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store);
      const first = service.recordInstalled(release());
      expect(
        errorCode(() => service.recordInstalled(release({ sequence: 40 }))),
      ).toBe("STALE");
      expect(
        errorCode(() => service.recordInstalled(release({ version: "0.0.8" }))),
      ).toBe("STALE");
      const repeated = service.recordInstalled(release());
      expect(repeated).toEqual(first);
      expect(store.getUpdateStatus()).toEqual(first);
    } finally {
      store.close();
    }
  });

  test("records available candidates only when newer on the configured channel", () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store, {
        channel: "stable",
        now: () => "2026-10-06T00:00:00.000Z",
      });
      service.recordInstalled(release());
      expect(errorCode(() => service.recordCheck("update-available"))).toBe(
        "INVALID_INPUT",
      );
      expect(
        errorCode(() =>
          service.recordCheck("update-available", release({ sequence: 41 })),
        ),
      ).toBe("STALE");
      expect(
        errorCode(() =>
          service.recordCheck(
            "update-available",
            release({ sequence: 42, channel: "preview" }),
          ),
        ),
      ).toBe("INVALID_INPUT");
      const reported = service.recordCheck(
        "update-available",
        release({ sequence: 42, version: "0.0.8" }),
      );
      expect(reported.lastOutcome).toBe("update-available");
      expect(reported.lastCheckAt).toBe("2026-10-06T00:00:00.000Z");
      expect(reported.pending?.sequence).toBe(42);
      expect(service.status().installed?.sequence).toBe(41);
    } finally {
      store.close();
    }
  });

  test("up-to-date clears pending; contradictory reports are rejected", () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store, {
        now: () => "2026-10-06T00:00:00.000Z",
      });
      service.recordInstalled(release());
      service.recordCheck("update-available", release({ sequence: 42 }));
      expect(service.status().pending?.sequence).toBe(42);
      const settled = service.recordCheck("up-to-date");
      expect(settled.pending).toBeNull();
      expect(settled.lastOutcome).toBe("up-to-date");
      expect(
        errorCode(() =>
          service.recordCheck("up-to-date", release({ sequence: 43 })),
        ),
      ).toBe("INVALID_INPUT");
      expect(errorCode(() => service.recordCheck("bogus" as never))).toBe(
        "INVALID_INPUT",
      );
    } finally {
      store.close();
    }
  });

  test("failed checks keep pending; unconfigured clears it and takes no candidate", () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store, {
        now: () => "2026-10-06T00:00:00.000Z",
      });
      service.recordInstalled(release());
      service.recordCheck("update-available", release({ sequence: 42 }));
      const failed = service.recordCheck("check-failed");
      expect(failed.lastOutcome).toBe("check-failed");
      expect(failed.pending?.sequence).toBe(42);
      expect(
        errorCode(() =>
          service.recordCheck("check-failed", release({ sequence: 43 })),
        ),
      ).toBe("INVALID_INPUT");
      const cleared = service.recordCheck("unconfigured");
      expect(cleared.lastOutcome).toBe("unconfigured");
      expect(cleared.pending).toBeNull();
    } finally {
      store.close();
    }
  });

  test("installing a newer release supersedes older pending candidates", () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store);
      service.recordInstalled(release());
      service.recordCheck("update-available", release({ sequence: 42 }));
      const installed = service.recordInstalled(
        release({ sequence: 42, version: "0.0.8" }),
      );
      expect(installed.installed?.version).toBe("0.0.8");
      expect(installed.pending).toBeNull();
    } finally {
      store.close();
    }
  });

  test("rejects an unknown service channel at construction", () => {
    const store = new StudioStore(":memory:");
    try {
      expect(
        errorCode(
          () =>
            new HostUpdateStatusService(store, { channel: "beta" as never }),
        ),
      ).toBe("INVALID_INPUT");
    } finally {
      store.close();
    }
  });

  test("persists across reopen with unrelated rows intact", () => {
    const folder = temporaryFolder();
    const file = join(folder, "studio.sqlite");
    const store = new StudioStore(file);
    store.updateSettings(defaultSettings(0), 0);
    const service = new HostUpdateStatusService(store);
    service.recordInstalled(release());
    service.recordCheck(
      "update-available",
      release({ sequence: 42 }),
      "2026-10-06T00:00:00.000Z",
    );
    store.close();
    const reopened = new StudioStore(file);
    try {
      const status = reopened.getUpdateStatus();
      expect(status?.installed?.sequence).toBe(41);
      expect(status?.pending?.sequence).toBe(42);
      expect(status?.lastOutcome).toBe("update-available");
      expect(reopened.getSnapshot().settings).not.toBeNull();
    } finally {
      reopened.close();
    }
  });

  test("migrates a v6 database to v7 with a pre-migration backup", () => {
    const folder = temporaryFolder();
    const file = join(folder, "studio.sqlite");
    const backups = join(folder, "backups");
    const legacy = new Database(file);
    applyMigrations(
      legacy,
      STUDIO_MIGRATIONS.filter((migration) => migration.version <= 6),
      { databaseFile: file, backupDirectory: backups },
    );
    expect(currentSchemaVersion(legacy)).toBe(6);
    legacy.close();
    const store = new StudioStore(file, { backupDirectory: backups });
    const service = new HostUpdateStatusService(store);
    service.recordInstalled(release());
    expect(store.getUpdateStatus()?.installed?.sequence).toBe(41);
    store.close();
    const probe = new Database(file, { readonly: true });
    try {
      expect(
        probe
          .query("SELECT 1 FROM sqlite_master WHERE name = 'update_status'")
          .get(),
      ).not.toBeNull();
    } finally {
      probe.close();
    }
    expect(readdirSync(backups).length).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from "bun:test";
import {
  PartitionError,
  partitionKey,
  type RuntimeSession,
  SessionAdapter,
  type SessionRuntime,
  type TrustedPartition,
} from "../../apps/studio/bunium/runtime/session";

function fakeRuntime() {
  const log: string[] = [];
  const live = new Set<string>();
  const make = (label: string): RuntimeSession => {
    let released = false;
    const session: RuntimeSession = {
      get released() {
        return released;
      },
      release() {
        released = true;
        live.delete(label);
        log.push(`release:${label}`);
      },
      retain: () => session,
    };
    live.add(label);
    return session;
  };
  let ephemeralCount = 0;
  const runtime: SessionRuntime = {
    BuniumSession: {
      clearPartition(key) {
        log.push(`clear:${key}`);
        return { generation: 2, removedNow: false };
      },
      ephemeral: () => make(`ephemeral-${++ephemeralCount}`),
      fromPartition(key) {
        log.push(`open:${key}`);
        return make(key);
      },
      isInUse: (key) => live.has(key),
      removePartition(key) {
        log.push(`remove:${key}`);
        return { removedNow: true };
      },
    },
    sessionApiVersion: 1,
  };
  return { log, runtime };
}

const records: Record<string, TrustedPartition> = {
  "project-1:user-1:android": {
    ephemeral: false,
    id: "project-1:user-1:android",
  },
  "project-1:user-2:ios": { ephemeral: false, id: "project-1:user-2:ios" },
  temporary: { ephemeral: true, id: "temporary" },
};
const registry = { resolve: (id: string) => records[id] };

describe("partition session adapter", () => {
  test("derives fixed-length, path-safe keys from registry IDs", () => {
    const key = partitionKey("../../etc/passwd");
    expect(key).toMatch(/^p[0-9a-f]{40}$/);
    expect(partitionKey("project-1:user-1:android")).toBe(
      partitionKey("project-1:user-1:android"),
    );
    expect(partitionKey("a")).not.toBe(partitionKey("b"));
  });

  test("refuses runtimes without the session API", () => {
    expect(() => new SessionAdapter({}, registry)).toThrow(PartitionError);
    expect(
      () => new SessionAdapter({ sessionApiVersion: 2 }, registry),
    ).toThrow(PartitionError);
  });

  test("only trusted registry records can be opened", () => {
    const { runtime } = fakeRuntime();
    const adapter = new SessionAdapter(runtime, registry);
    expect(() => adapter.acquire("guest-chosen-id")).toThrow(
      "unknown-partition",
    );
  });

  test("reference counts leases and releases once at zero", () => {
    const { log, runtime } = fakeRuntime();
    const adapter = new SessionAdapter(runtime, registry);
    const first = adapter.acquire("project-1:user-1:android");
    const second = adapter.acquire("project-1:user-1:android");
    expect(first.session).toBe(second.session);
    expect(log.filter((entry) => entry.startsWith("open:"))).toHaveLength(1);
    first.release();
    first.release();
    expect(first.session.released).toBe(false);
    second.release();
    expect(second.session.released).toBe(true);
    expect(log.at(-1)).toBe(
      `release:${partitionKey("project-1:user-1:android")}`,
    );
  });

  test("distinct records get distinct sessions", () => {
    const { runtime } = fakeRuntime();
    const adapter = new SessionAdapter(runtime, registry);
    const android = adapter.acquire("project-1:user-1:android");
    const ios = adapter.acquire("project-1:user-2:ios");
    expect(android.session).not.toBe(ios.session);
  });

  test("clear and remove refuse while in use and map to runtime keys", () => {
    const { log, runtime } = fakeRuntime();
    const adapter = new SessionAdapter(runtime, registry);
    const lease = adapter.acquire("project-1:user-1:android");
    expect(() => adapter.clear("project-1:user-1:android")).toThrow(
      "partition-in-use",
    );
    lease.release();
    expect(adapter.clear("project-1:user-1:android")).toEqual({
      removedNow: false,
    });
    expect(adapter.remove("project-1:user-1:android")).toEqual({
      removedNow: true,
    });
    const key = partitionKey("project-1:user-1:android");
    expect(log).toContain(`clear:${key}`);
    expect(log).toContain(`remove:${key}`);
  });

  test("ephemeral partitions share memory while open and are discarded", () => {
    const { runtime } = fakeRuntime();
    const adapter = new SessionAdapter(runtime, registry);
    const first = adapter.acquire("temporary");
    const second = adapter.acquire("temporary");
    expect(first.session).toBe(second.session);
    first.release();
    second.release();
    expect(first.session.released).toBe(true);
    const next = adapter.acquire("temporary");
    expect(next.session).not.toBe(first.session);
    next.release();
    expect(adapter.clear("temporary")).toEqual({ removedNow: true });
  });
});

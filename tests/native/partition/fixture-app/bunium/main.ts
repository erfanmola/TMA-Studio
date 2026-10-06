// Native partition isolation fixture. Without FIXTURE_PHASE it is the
// orchestrator: it never loads CEF itself and runs each phase as a separate
// process (a real restart), then checks the combined evidence.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { page, serviceWorker } from "./page";

type Probe = {
  cookie: string | null;
  sessionCookie: string | null;
  localStorage: string | null;
  indexedDB: string | null;
  cacheStorage: string | null;
  serviceWorkers: number;
  serviceWorkerProbe: string;
};
type Report = { label: string; before?: Probe; after?: Probe; error?: string };
type State = {
  port: number;
  keys: { a: string; b: string; spare: string };
  tokens: { a: string; b: string; e: string };
  phases: Record<string, unknown>;
};

const phase = process.env.FIXTURE_PHASE;
const statePath = process.env.FIXTURE_STATE ?? "";

if (!phase) {
  await orchestrate();
} else {
  await runPhase(phase);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

async function orchestrate(): Promise<void> {
  const id = randomBytes(4).toString("hex");
  const state: State = {
    port: await freePort(),
    keys: {
      a: `fixture-a-${id}`,
      b: `fixture-b-${id}`,
      spare: `fixture-spare-${id}`,
    },
    tokens: { a: `A${id}`, b: `B${id}`, e: `E${id}` },
    phases: {},
  };
  const file = join(tmpdir(), `bunium-partition-${id}.json`);
  writeFileSync(file, JSON.stringify(state));
  for (const name of ["write", "persist", "cleared", "swept"]) {
    const result = spawnSync(process.execPath, [import.meta.path], {
      env: { ...process.env, FIXTURE_PHASE: name, FIXTURE_STATE: file },
      stdio: "inherit",
      timeout: 90_000,
    });
    if (result.status !== 0) {
      console.log(`PARTITION_PHASE_${name.toUpperCase()}:FAIL`);
      console.log("NATIVE_PARTITION_GATE:FAIL");
      process.exit(1);
    }
    console.log(`PARTITION_PHASE_${name.toUpperCase()}:PASS`);
  }
  const final = JSON.parse(readFileSync(file, "utf8")) as State;
  console.log(`PARTITION_EVIDENCE ${JSON.stringify(final.phases)}`);
  console.log("NATIVE_PARTITION_GATE:PASS");
}

type Runtime = {
  app: { shutdown(): void };
  BuniumWindow: new (options: {
    url: string;
    width?: number;
    height?: number;
    title?: string;
    session?: unknown;
  }) => { close(): void };
  BuniumSession: {
    fromPartition(key: string): RuntimeSession;
    ephemeral(): RuntimeSession;
    clearPartition(key: string): { generation: number; removedNow: boolean };
    removePartition(key: string): { removedNow: boolean };
    isInUse(key: string): boolean;
    readonly storageRoot: string;
  };
  PartitionInUseError: new (...args: never[]) => Error;
  sessionApiVersion?: number;
};
type RuntimeSession = {
  key: string | null;
  generation: number;
  referenceCount: number;
  release(): void;
};

async function runPhase(name: string): Promise<void> {
  const state = JSON.parse(readFileSync(statePath, "utf8")) as State;
  const runtime = (await import(
    process.env.BUNIUM_MODULE ?? "bunium"
  )) as unknown as Runtime;
  if (runtime.sessionApiVersion !== 1) fail("runtime lacks session API v1");

  const reports = new Map<string, Report>();
  const waiters = new Map<string, (report: Report) => void>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: state.port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/report") {
        const report = (await request.json()) as Report;
        reports.set(report.label, report);
        waiters.get(report.label)?.(report);
        return new Response("ok");
      }
      if (url.pathname === "/sw.js") {
        return new Response(serviceWorker, {
          headers: { "Content-Type": "text/javascript" },
        });
      }
      if (url.pathname === "/sw-probe") return new Response("server");
      return new Response(page, { headers: { "Content-Type": "text/html" } });
    },
  });

  const probe = async (
    label: string,
    session: RuntimeSession,
    mode: "read" | "write",
    token = "",
  ): Promise<Report> => {
    const done = new Promise<Report>((resolve, reject) => {
      waiters.set(label, resolve);
      setTimeout(() => reject(new Error(`timeout: ${label}`)), 20_000);
    });
    const win = new runtime.BuniumWindow({
      url: `http://127.0.0.1:${state.port}/?label=${label}&mode=${mode}&token=${token}`,
      width: 360,
      height: 240,
      title: `partition ${label}`,
      session,
    });
    try {
      const report = await done;
      if (report.error) throw new Error(`${label}: ${report.error}`);
      return report;
    } finally {
      win.close();
    }
  };

  const evidence: Record<string, unknown> = {};
  const check = (label: string, condition: boolean, detail?: unknown) => {
    evidence[label] = condition;
    if (!condition) fail(`${label} ${JSON.stringify(detail)}`);
  };
  const empty = (value: Probe | undefined) =>
    !!value &&
    value.cookie === null &&
    value.sessionCookie === null &&
    value.localStorage === null &&
    value.indexedDB === null &&
    value.cacheStorage === null &&
    value.serviceWorkers === 0 &&
    value.serviceWorkerProbe === "server";
  const holds = (value: Probe | undefined, token: string) =>
    !!value &&
    value.cookie === token &&
    value.sessionCookie === token &&
    value.localStorage === token &&
    value.indexedDB === token &&
    value.cacheStorage === token &&
    value.serviceWorkers === 1 &&
    value.serviceWorkerProbe === `sw:${token}`;

  try {
    const { BuniumSession } = runtime;
    if (name === "write") {
      for (const bad of [
        "../escape",
        "/abs",
        "UPPER",
        "a b",
        "",
        "x".repeat(65),
      ]) {
        let rejected = false;
        try {
          BuniumSession.fromPartition(bad);
        } catch {
          rejected = true;
        }
        check(`rejects key ${JSON.stringify(bad.slice(0, 12))}`, rejected);
      }
      const a = BuniumSession.fromPartition(state.keys.a);
      const again = BuniumSession.fromPartition(state.keys.a);
      check(
        "same key shares one reference-counted session",
        a === again && a.referenceCount === 2,
      );
      again.release();
      const writeA = await probe("write-a", a, "write", state.tokens.a);
      check("A starts empty", empty(writeA.before), writeA.before);
      check(
        "A stores all data kinds",
        holds(writeA.after, state.tokens.a),
        writeA.after,
      );
      let refused = false;
      try {
        BuniumSession.clearPartition(state.keys.a);
      } catch (error) {
        refused = error instanceof runtime.PartitionInUseError;
      }
      check("clear refused while in use", refused);
      const b = BuniumSession.fromPartition(state.keys.b);
      const writeB = await probe("write-b", b, "write", state.tokens.b);
      check(
        "B does not see A (same origin)",
        empty(writeB.before),
        writeB.before,
      );
      check(
        "B stores all data kinds",
        holds(writeB.after, state.tokens.b),
        writeB.after,
      );
      const e = BuniumSession.ephemeral();
      const writeE = await probe("write-e", e, "write", state.tokens.e);
      check("ephemeral starts empty", empty(writeE.before), writeE.before);
      check(
        "ephemeral stores data in memory",
        holds(writeE.after, state.tokens.e),
        writeE.after,
      );
      const e2 = BuniumSession.ephemeral();
      const readE2 = await probe("read-e2", e2, "read");
      check(
        "ephemeral sessions are isolated",
        empty(readE2.before),
        readE2.before,
      );
      const readA = await probe("reread-a", a, "read");
      check(
        "A unaffected by B and ephemeral",
        holds(readA.before, state.tokens.a),
        readA.before,
      );
      for (const session of [a, b, e, e2]) session.release();
      check(
        "released key no longer in use",
        !BuniumSession.isInUse(state.keys.a),
      );
    }
    if (name === "persist") {
      const a = BuniumSession.fromPartition(state.keys.a);
      const b = BuniumSession.fromPartition(state.keys.b);
      const readA = await probe("persist-a", a, "read");
      const readB = await probe("persist-b", b, "read");
      check(
        "A persisted across restart",
        holds(readA.before, state.tokens.a),
        readA.before,
      );
      check(
        "B persisted across restart",
        holds(readB.before, state.tokens.b),
        readB.before,
      );
      const e = BuniumSession.ephemeral();
      const readE = await probe("persist-e", e, "read");
      check(
        "ephemeral data discarded on restart",
        empty(readE.before),
        readE.before,
      );
      const generation = a.generation;
      for (const session of [a, b, e]) session.release();
      const cleared = BuniumSession.clearPartition(state.keys.a);
      check(
        "clear bumps generation",
        cleared.generation === generation + 1,
        cleared,
      );
      check(
        "clear defers deletion of files this process opened",
        cleared.removedNow === false,
        cleared,
      );
      const fresh = BuniumSession.fromPartition(state.keys.a);
      const readFresh = await probe("cleared-now-a", fresh, "read");
      check(
        "cleared A is empty immediately",
        empty(readFresh.before),
        readFresh.before,
      );
      fresh.release();
      state.phases.oldGeneration = generation;
    }
    if (name === "cleared") {
      const a = BuniumSession.fromPartition(state.keys.a);
      const b = BuniumSession.fromPartition(state.keys.b);
      const root = BuniumSession.storageRoot;
      const oldDir = join(
        root,
        `bp.${state.keys.a}.g${state.phases.oldGeneration}`,
      );
      check(
        "previous A generation deleted on next launch",
        !existsSync(oldDir),
        oldDir,
      );
      const readA = await probe("cleared-a", a, "read");
      const readB = await probe("kept-b", b, "read");
      check("A stays cleared after restart", empty(readA.before), readA.before);
      check(
        "B intact after clearing A",
        holds(readB.before, state.tokens.b),
        readB.before,
      );
      a.release();
      b.release();
      check(
        "remove A deferred",
        !BuniumSession.removePartition(state.keys.a).removedNow,
      );
      check(
        "remove B deferred",
        !BuniumSession.removePartition(state.keys.b).removedNow,
      );
      state.phases.root = root;
    }
    if (name === "swept") {
      const spare = BuniumSession.clearPartition(state.keys.spare);
      const root = String(state.phases.root);
      const left = (key: string) =>
        readdirSync(root).filter((name) => name.startsWith(`bp.${key}.`));
      check(
        "removed A deleted on next launch",
        left(state.keys.a).length === 0,
        left(state.keys.a),
      );
      check(
        "removed B deleted on next launch",
        left(state.keys.b).length === 0,
        left(state.keys.b),
      );
      check(
        "never-opened partition removed immediately",
        BuniumSession.removePartition(state.keys.spare).removedNow &&
          spare.removedNow,
      );
    }
    state.phases[name] = evidence;
    writeFileSync(statePath, JSON.stringify(state));
    console.log(`PARTITION_${name.toUpperCase()} ${JSON.stringify(evidence)}`);
  } catch (error) {
    fail(String(error instanceof Error ? error.message : error));
  } finally {
    server.stop(true);
  }
  runtime.app.shutdown();
  process.exit(0);
}

function fail(message: string): never {
  console.error(`PARTITION_FAIL ${message}`);
  process.exit(1);
}

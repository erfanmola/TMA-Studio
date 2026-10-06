// Shell-only lifecycle/performance runner (11c, partial).
// Measures host shell work with no guest, frame, record or idle-loop claims:
// repeated store startup, input-latency proxy (settings parse), twenty
// create/close lifecycle cycles with RSS attribution, and variance-aware
// baseline comparison. Guest/frame/record metrics stay explicitly open
// until 09b and native composition land.
//
// Usage:
//   bun scripts/perf-runner.mjs [--iterations N] [--baseline path] [--update-baseline path]
// Results JSON goes to stdout; diagnostics to stderr. Exit 0 always unless
// the runner itself crashes; regression verdicts are reported, not enforced,
// until named-hardware baselines exist.

import { StudioStore } from "../apps/studio/bunium/services/store.ts";
import { StudioSettingsSchema } from "../apps/studio/src/contracts/schemas.ts";
import { defaultSettings } from "../apps/studio/src/contracts/settings-defaults.ts";
import {
  checkRegression,
  mean,
  monotonicGrowth,
  stddev,
} from "./perf-stats.mjs";

const args = process.argv.slice(2);
const iterations = Number(args[args.indexOf("--iterations") + 1] ?? 5) || 5;
const baselinePath = args.includes("--baseline")
  ? args[args.indexOf("--baseline") + 1]
  : null;
const updatePath = args.includes("--update-baseline")
  ? args[args.indexOf("--update-baseline") + 1]
  : null;

const hardware = `${process.platform}-${process.arch}-cpu${navigator?.hardwareConcurrency ?? "unknown"}`;

function rssMB() {
  return process.memoryUsage().rss / 1048576;
}

function time(fn, repeat = 1) {
  const samples = [];
  for (let i = 0; i < repeat; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return samples;
}

// 1. Store startup: fresh in-memory store + snapshot read, repeated.
const startupSamples = time(() => {
  const store = new StudioStore(":memory:");
  store.getSnapshot();
  store.close();
}, iterations);

// 2. Input-latency proxy: bounded settings parse + store write path shape.
// (Renderer event latency itself needs OS input evidence; this measures the
// host validation cost that every settings save pays.)
const settingsSamples = time(
  () => {
    StudioSettingsSchema.parse({ ...defaultSettings(0), locale: "fa" });
  },
  Math.max(iterations * 4, 20),
);

// 3. Twenty create/close lifecycle cycles with RSS attribution.
const rssBefore = rssMB();
const cycleSamples = [];
let leaked = false;
{
  const store = new StudioStore(":memory:");
  try {
    for (let cycle = 0; cycle < 20; cycle++) {
      const start = performance.now();
      const projectId = `perf-project-${cycle}`;
      const identityId = `perf-identity-${cycle}`;
      store.createIdentity({
        id: identityId,
        kind: "mock",
        telegramId: String(9000000 + cycle),
        firstName: "Perf",
        languageCode: "en",
        isPremium: false,
        revision: 0,
      });
      const now = new Date(0).toISOString();
      store.createProject({
        id: projectId,
        name: `Perf ${cycle}`,
        url: "https://example.test/perf",
        avatarColorIndex: 0,
        identityId,
        defaultMode: "overlay",
        launch: { kind: "mock", signing: "unsigned", advanced: {} },
        splash: {
          title: "Perf",
          lightBackground: "#ffffff",
          darkBackground: "#000000",
          presentation: "project",
        },
        createdAt: now,
        updatedAt: now,
        revision: 0,
      });
      const partition = store.putPartition({
        id: `perf-part-${cycle}`,
        projectId,
        identityId,
        platform: "android",
        isolationProfile: "default",
        ephemeral: true,
        schemaVersion: 1,
      });
      store.deletePartition(partition.id);
      store.deleteProject(projectId, 1);
      store.deleteMockIdentity(identityId, 1);
      cycleSamples.push(performance.now() - start);
    }
    const remaining =
      store.listPartitions().length +
      store.listIdentities().length +
      store.getSnapshot().projects.length;
    leaked = remaining !== 0;
  } finally {
    store.close();
  }
}
const rssAfter = rssMB();
const rssGrew = monotonicGrowth(rssBefore, rssAfter, 25);

const result = {
  hardware,
  iterations,
  shell: {
    storeStartupMs: {
      samples: startupSamples,
      mean: mean(startupSamples),
      stddev: stddev(startupSamples),
    },
    settingsParseMs: {
      samples: settingsSamples,
      mean: mean(settingsSamples),
      stddev: stddev(settingsSamples),
    },
    lifecycleCycleMs: {
      samples: cycleSamples,
      mean: mean(cycleSamples),
      stddev: stddev(cycleSamples),
    },
    rssMB: { before: rssBefore, after: rssAfter, grew: rssGrew, leaked },
  },
  guest: null,
  frame: null,
  record: null,
  open: [
    "guest metrics need native composition (01e/11b)",
    "frame metrics need packaged runs on named hardware",
    "record metrics need 09b (gated)",
  ],
};

if (baselinePath) {
  try {
    const baseline = JSON.parse(await Bun.file(baselinePath).text());
    result.regressions = {
      startup: checkRegression(
        baseline.shell.storeStartupMs.samples,
        startupSamples,
        { absoluteFloor: 5 },
      ),
      settingsParse: checkRegression(
        baseline.shell.settingsParseMs.samples,
        settingsSamples,
        { absoluteFloor: 0.5 },
      ),
      lifecycle: checkRegression(
        baseline.shell.lifecycleCycleMs.samples,
        cycleSamples,
        { absoluteFloor: 1 },
      ),
    };
  } catch (error) {
    console.error(`No usable baseline at ${baselinePath}: ${error.message}`);
  }
}

if (updatePath) {
  await Bun.write(updatePath, JSON.stringify(result, null, 2));
  console.error(`Baseline written to ${updatePath}`);
}

console.log(JSON.stringify(result, null, 2));

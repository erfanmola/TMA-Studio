import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureScreenshot } from "../../../apps/studio/bunium/services/screenshot-capture.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const title = "01e trusted overlay composition fixture";
const buniumRepo = process.env.BUNIUM_REPO;
if (!buniumRepo) throw new Error("Set BUNIUM_REPO to a Bunium checkout");

const evidenceDir =
  process.env.CAPTURE_EVIDENCE_DIR ?? "/tmp/01g-capture-evidence";
await mkdir(evidenceDir, { recursive: true });
const buildDir = await mkdtemp(join(tmpdir(), "tma-studio-01g-build-"));
const binary = join(buildDir, "macos-window-capture");
const screenshotBinary = join(buildDir, "tma-studio-capture");
const swiftSource = resolve(here, "macos-window-capture.swift");
const fixtureMain = resolve(
  root,
  "tests/native/composition/fixture-app/bunium/main.ts",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function waitForExit(child, timeoutMs = 30_000) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("native capture helper timed out"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });
}

const compile = run("swiftc", ["-parse-as-library", "-o", binary, swiftSource]);
if (compile.status !== 0) {
  throw new Error(`swiftc failed:\n${compile.stdout}\n${compile.stderr}`);
}
const screenshotCompile = run(process.execPath, [
  resolve(root, "scripts/build-studio-capture.mjs"),
  "--out",
  screenshotBinary,
]);
if (screenshotCompile.status !== 0) {
  throw new Error(
    `screenshot helper build failed:\n${screenshotCompile.stdout}\n${screenshotCompile.stderr}`,
  );
}

const fixture = spawn(process.execPath, [fixtureMain], {
  cwd: root,
  env: {
    ...process.env,
    BUNIUM_MODULE: resolve(buniumRepo, "src/index.ts"),
    BUNIUM_REPO: buniumRepo,
    HOLD_OPEN: "1",
    HOLD_OPEN_MS: "120000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let fixtureOutput = "";
const collect = (chunk) => {
  fixtureOutput += chunk.toString();
};
fixture.stdout.on("data", collect);
fixture.stderr.on("data", collect);

async function waitForFixture() {
  const started = Date.now();
  while (
    !fixtureOutput.includes("NATIVE_COMPOSITION_GATE:PASS") ||
    !fixtureOutput.includes("COMPOSITION_DECOY_READY")
  ) {
    if (fixture.exitCode !== null) {
      throw new Error(`composition fixture exited early:\n${fixtureOutput}`);
    }
    if (Date.now() - started > 30_000) {
      throw new Error(
        `composition fixture did not become ready:\n${fixtureOutput}`,
      );
    }
    await Bun.sleep(50);
  }
}

async function capture(output, seconds, options = {}) {
  const command = options.cancelAfterMs ? binary : "/usr/bin/time";
  const args = options.cancelAfterMs
    ? [title, output, String(seconds), "1280", "960"]
    : ["-l", binary, title, output, String(seconds), "1280", "960"];
  const helper = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  helper.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exited = waitForExit(helper, 45_000);
  if (options.cancelAfterMs) {
    setTimeout(() => helper.kill("SIGINT"), options.cancelAfterMs);
  }
  const status = await exited;
  return { ...status, stderr };
}

try {
  await waitForFixture();
  const captureRunId = `${Date.now()}`;
  let requestedDirectory = false;
  const request = {
    requestId: "capture-native-fixture",
    scope: "window",
    side: "top",
    host: { width: 640, height: 480 },
    guest: { x: 0, y: 50, width: 640, height: 430 },
  };
  const fullOutcome = await captureScreenshot(
    {
      async showOpenDialog(options) {
        requestedDirectory =
          options.canChooseDirectories &&
          !options.allowMultiple &&
          options.canCreateDirectories;
        return { canceled: false, paths: [evidenceDir] };
      },
    },
    request,
    {
      pid: fixture.pid,
      title,
      helperPath: screenshotBinary,
      platform: "darwin",
    },
  );
  assert.equal(requestedDirectory, true);
  assert.equal(fullOutcome.state, "saved");
  if (fullOutcome.state !== "saved")
    throw new Error("screenshot service did not save");
  const fullScreenshot = join(evidenceDir, fullOutcome.fileName);
  assert.ok((await stat(fullScreenshot)).size > 10_000);
  const fullSize = run("sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    fullScreenshot,
  ]);
  assert.equal(fullSize.status, 0, fullSize.stderr);
  assert.match(fullSize.stdout, /pixelWidth: 1280/u);
  assert.match(fullSize.stdout, /pixelHeight: 1024/u);
  const canceled = await captureScreenshot(
    {
      async showOpenDialog() {
        return { canceled: true, paths: [] };
      },
    },
    request,
    {
      pid: fixture.pid,
      title,
      helperPath: screenshotBinary,
      platform: "darwin",
    },
  );
  assert.equal(canceled.state, "canceled");
  const unwritable = await captureScreenshot(
    {
      async showOpenDialog() {
        return {
          canceled: false,
          paths: [join(evidenceDir, "missing-output-folder")],
        };
      },
    },
    request,
    {
      pid: fixture.pid,
      title,
      helperPath: screenshotBinary,
      platform: "darwin",
    },
  );
  assert.equal(unwritable.state, "failed");
  const decoyScreenshot = join(
    evidenceDir,
    `studio-decoy-window-${captureRunId}.png`,
  );
  const decoyResult = run(screenshotBinary, [
    String(fixture.pid),
    "01e decoy composition fixture",
    "640",
    "480",
    "0",
    "0",
    "640",
    "480",
    "window",
    decoyScreenshot,
  ]);
  assert.equal(
    decoyResult.status,
    0,
    `${decoyResult.stdout}\n${decoyResult.stderr}`,
  );
  assert.ok((await stat(decoyScreenshot)).size > 1_000);
  const fallbackScreenshot = join(
    evidenceDir,
    `studio-coregraphics-fallback-${captureRunId}.png`,
  );
  const fallbackResult = run(
    screenshotBinary,
    [
      String(fixture.pid),
      title,
      "640",
      "480",
      "0",
      "0",
      "640",
      "480",
      "window",
      fallbackScreenshot,
    ],
    { env: { ...process.env, TMA_STUDIO_FORCE_COREGRAPHICS: "1" } },
  );
  assert.equal(
    fallbackResult.status,
    0,
    `${fallbackResult.stdout}\\n${fallbackResult.stderr}`,
  );
  assert.ok((await stat(fallbackScreenshot)).size > 10_000);
  const protectedSize = (await stat(fullScreenshot)).size;
  const duplicate = run(screenshotBinary, [
    String(fixture.pid),
    title,
    "640",
    "480",
    "0",
    "0",
    "640",
    "480",
    "window",
    fullScreenshot,
  ]);
  assert.notEqual(
    duplicate.status,
    0,
    "capture must refuse to overwrite an existing image",
  );
  assert.equal((await stat(fullScreenshot)).size, protectedSize);

  const telegramScreenshot = join(
    evidenceDir,
    `studio-telegram-surface-${captureRunId}.png`,
  );
  const telegramResult = run(screenshotBinary, [
    String(fixture.pid),
    title,
    "640",
    "480",
    "0",
    "50",
    "640",
    "430",
    "telegram",
    telegramScreenshot,
  ]);
  assert.equal(
    telegramResult.status,
    0,
    `${telegramResult.stdout}\\n${telegramResult.stderr}`,
  );
  const telegramSize = run("sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    telegramScreenshot,
  ]);
  assert.equal(telegramSize.status, 0, telegramSize.stderr);
  assert.match(telegramSize.stdout, /pixelWidth: 1280/u);
  assert.match(telegramSize.stdout, /pixelHeight: 860/u);

  const viewportScreenshot = join(
    evidenceDir,
    `studio-guest-viewport-${captureRunId}.png`,
  );
  const viewportResult = run(screenshotBinary, [
    String(fixture.pid),
    title,
    "640",
    "480",
    "80",
    "60",
    "300",
    "300",
    "viewport",
    viewportScreenshot,
  ]);
  assert.equal(
    viewportResult.status,
    0,
    `${viewportResult.stdout}\n${viewportResult.stderr}`,
  );
  assert.ok((await stat(viewportScreenshot)).size > 1_000);
  const viewportSize = run("sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    viewportScreenshot,
  ]);
  assert.equal(viewportSize.status, 0, viewportSize.stderr);
  assert.match(viewportSize.stdout, /pixelWidth: 600/u);
  assert.match(viewportSize.stdout, /pixelHeight: 600/u);

  const movie = join(evidenceDir, "composed-window.mov");
  const recording = await capture(movie, 3);
  assert.equal(recording.code, 0, recording.stderr);
  assert.match(recording.stderr, /CAPTURE_RESULT:/);
  const resultLine = recording.stderr
    .split("\n")
    .find((line) => line.startsWith("CAPTURE_RESULT:"));
  assert.ok(resultLine, recording.stderr);
  const result = JSON.parse(resultLine.slice("CAPTURE_RESULT:".length));
  assert.equal(result.queueDepth, 3);
  assert.equal(result.outputFrameRate, 30);
  assert.ok(result.acceptedFrames >= 80, JSON.stringify(result));

  const frame = join(evidenceDir, "composed-window.png");
  const extracted = run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    movie,
    "-frames:v",
    "1",
    frame,
  ]);
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.ok((await stat(frame)).size > 10_000);
  const media = run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height,r_frame_rate,duration,nb_frames",
    "-of",
    "json",
    movie,
  ]);
  assert.equal(media.status, 0, media.stderr);
  const stream = JSON.parse(media.stdout).streams?.[0];
  assert.equal(stream?.codec_name, "h264");
  assert.equal(stream?.width, 1280);
  assert.equal(stream?.height, 960);
  assert.equal(stream?.r_frame_rate, "30/1");
  assert.ok(Number(stream?.nb_frames) >= 80);
  assert.ok(Number(stream?.duration) >= 2.8);
  assert.ok(Number(stream?.duration) <= 3.1);

  const cancelledOutput = join(evidenceDir, "cancelled.partial.mov");
  const cancelled = await capture(cancelledOutput, 60, {
    cancelAfterMs: 1_200,
  });
  assert.equal(cancelled.code, 130, cancelled.stderr);
  assert.match(cancelled.stderr, /CAPTURE_FAILED:capture cancelled/);
  assert.equal(
    await stat(cancelledOutput).then(
      () => true,
      () => false,
    ),
    false,
  );

  const full = await capture("/dev/full", 3);
  assert.notEqual(
    full.code,
    0,
    "the /dev/full ENOSPC sink must fail the writer",
  );
  assert.match(full.stderr, /CAPTURE_FAILED:AVAssetWriter:/);

  const peakRss = recording.stderr.match(
    /maximum resident set size\s+(\d+)/,
  )?.[1];
  console.log(
    `NATIVE_CAPTURE_EVIDENCE:${JSON.stringify({
      ...result,
      studioFullScreenshot: fullScreenshot,
      studioCoreGraphicsFallback: fallbackScreenshot,
      studioTelegramScreenshot: telegramScreenshot,
      studioViewportScreenshot: viewportScreenshot,
      movie,
      frame,
      ffprobe: stream,
      peakResidentBytes: peakRss ? Number(peakRss) : null,
      cancelExit: cancelled.code,
      diskFullExit: full.code,
    })}`,
  );
  console.log("NATIVE_CAPTURE_GATE:PASS");
} finally {
  fixture.kill("SIGTERM");
  await waitForExit(fixture, 10_000).catch(() => {});
  await rm(buildDir, { recursive: true, force: true });
}

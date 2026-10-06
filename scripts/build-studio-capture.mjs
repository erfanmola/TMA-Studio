import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outIndex = process.argv.indexOf("--out");
const out =
  outIndex >= 0 && process.argv[outIndex + 1]
    ? resolve(process.argv[outIndex + 1])
    : resolve(root, "apps/studio/bunium/native/tma-studio-capture");
if (process.platform !== "darwin") {
  process.stdout.write(
    "Native composed screenshots require macOS 12.0 or newer.\n",
  );
  process.exit(0);
}
mkdirSync(dirname(out), { recursive: true });
const source = resolve(root, "apps/studio/bunium/native/screenshot.swift");
const result = spawnSync(
  "swiftc",
  [
    "-O",
    "-parse-as-library",
    "-target",
    `${process.arch}-apple-macosx12.0`,
    source,
    "-o",
    out,
    "-framework",
    "AppKit",
    "-framework",
    "CoreImage",
    "-framework",
    "CoreMedia",
    "-framework",
    "CoreVideo",
    "-framework",
    "ImageIO",
    "-framework",
    "ScreenCaptureKit",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error(`swiftc exited with status ${result.status}.`);
chmodSync(out, 0o755);

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function argsFrom(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(
        "Usage: bun run package:mac -- --bunium-repo PATH --out PATH [--name NAME] [--bundle-id ID] [--version VERSION]",
      );
    }
    if (
      ![
        "--bunium-repo",
        "--out",
        "--name",
        "--bundle-id",
        "--version",
      ].includes(key)
    )
      throw new Error(`Unknown option ${key}.`);
    if (options.has(key)) throw new Error(`Duplicate option ${key}.`);
    options.set(key, value);
  }
  return options;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}.`);
}

const options = argsFrom(process.argv.slice(2));
const buniumRepoValue = options.get("--bunium-repo");
const outputValue = options.get("--out");
if (!buniumRepoValue || !outputValue)
  throw new Error("Both --bunium-repo and --out are required.");
const buniumRepo = resolve(buniumRepoValue);
const outputDir = resolve(outputValue);
const studioDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/studio",
);
const packager = join(buniumRepo, "packaging/mac/package.sh");
const mainEntry = join(studioDir, "bunium/main.ts");
const rendererDir = join(studioDir, "dist");
if (!existsSync(packager))
  throw new Error(`Missing Bunium packager: ${packager}`);
if (!existsSync(mainEntry)) throw new Error(`Missing host entry: ${mainEntry}`);
if (!existsSync(join(rendererDir, "index.html")))
  throw new Error("Build the Studio renderer before packaging.");

const stage = mkdtempSync(join(tmpdir(), "tma-studio-package-"));
try {
  const stagedBunium = join(stage, "bunium");
  mkdirSync(stagedBunium, { recursive: true });
  cpSync(rendererDir, join(stage, "dist"), { recursive: true });
  writeFileSync(
    join(stage, "package.json"),
    JSON.stringify(
      { name: "tma-studio-package", private: true, type: "module" },
      null,
      2,
    ),
  );

  run(process.execPath, [
    "build",
    mainEntry,
    "--target=bun",
    "--external=bunium",
    `--outdir=${stagedBunium}`,
  ]);
  if (!existsSync(join(stagedBunium, "main.js")))
    throw new Error("Bun did not emit the bundled host entry.");
  writeFileSync(join(stagedBunium, "main.ts"), 'import "./main.js";\n');

  run(process.execPath, [
    resolve(studioDir, "../../scripts/build-studio-capture.mjs"),
    "--out",
    join(stagedBunium, "native/tma-studio-capture"),
  ]);

  const packageArgs = [
    "-a",
    stage,
    "-r",
    buniumRepo,
    "-n",
    options.get("--name") ?? "TMAStudio",
    "-i",
    options.get("--bundle-id") ?? "dev.tma.studio",
    "-o",
    outputDir,
    "-v",
    options.get("--version") ?? "0.0.1",
    "--no-dmg",
  ];
  run(packager, packageArgs);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

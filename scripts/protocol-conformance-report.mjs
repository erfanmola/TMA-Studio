import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const inventoryPath = resolve(
  root,
  "apps/studio/src/domain/protocol/inventory.json",
);
const sdkPath = resolve(
  root,
  "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
);
const outputPath = resolve(root, "reports/protocol-conformance-report.md");
const check = process.argv.includes("--check");

async function listFiles(directory) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    }),
  );
  return files.flat();
}

const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
// Repo-relative display path with forward slashes on every OS: listFiles
// returns os-native paths, so on Windows a raw slice would embed "\\" and
// break both the familySuite comparison below and mac-identical output.
const toRepoPath = (path) =>
  path
    .slice(root.length + 1)
    .split("\\")
    .join("/");
const familySuiteByOwner = {
  "04b": "tests/unit/protocol-core.test.ts",
  "04c": "tests/unit/protocol-interactions.test.ts",
  "04d": "tests/unit/protocol-permissions.test.ts",
  "04e": "tests/unit/protocol-sensors-biometry.test.ts",
  "04f": "tests/unit/protocol-storage.test.ts",
  "04g": "tests/unit/protocol-actions.test.ts",
  "04h": "tests/unit/protocol-compatibility.test.ts",
};
const generatedRegistry = JSON.parse(
  await readFile(
    resolve(root, "apps/studio/src/domain/protocol/registry.generated.json"),
    "utf8",
  ),
);
const registryByKey = new Map(
  generatedRegistry.events.map((event) => [
    `${event.direction}:${event.event}`,
    event,
  ]),
);
const sdk = await readFile(sdkPath, "utf8");
const sdkHash = createHash("sha256").update(sdk).digest("hex");
const unitFiles = (await listFiles(resolve(root, "tests/unit")))
  .filter((path) => path.endsWith(".test.ts"))
  .sort();
const browserFiles = (await listFiles(resolve(root, "tests/visual/browser")))
  .filter((path) => path.endsWith(".pw.ts"))
  .sort();
const testFiles = [...unitFiles, ...browserFiles];
const contents = new Map(
  await Promise.all(
    testFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

const rows = inventory.events.map((event) => {
  const generated = registryByKey.get(`${event.direction}:${event.name}`);
  const literalUnitRefs = unitFiles.filter((path) =>
    contents.get(path)?.includes(event.name),
  );
  const familySuite = generated
    ? familySuiteByOwner[generated.ownerCard]
    : undefined;
  const familySuitePath =
    familySuite && unitFiles.some((path) => toRepoPath(path) === familySuite)
      ? familySuite
      : undefined;
  const browserRefs = browserFiles.filter((path) =>
    contents.get(path)?.includes(event.name),
  );
  const scenarioBindings = event.testIds.filter((testId) =>
    [...contents.values()].some((content) => content.includes(testId)),
  );
  return {
    id: event.id,
    event: event.name,
    direction: event.direction,
    owner: generated?.ownerCard ?? "unassigned",
    coverageMode: familySuitePath
      ? "registry-driven family suite"
      : "no owner suite",
    minimumVersion: event.minimumVersion,
    sdkSourceReference: sdk.includes(event.name),
    unitLiteralReferences: literalUnitRefs.map((path) => toRepoPath(path)),
    unitFamilySuite: familySuitePath,
    browserSourceReferences: browserRefs.map((path) => toRepoPath(path)),
    scenarioIds: event.testIds,
    directlyBoundScenarioIds: scenarioBindings,
  };
});
const declaredScenarioIds = rows.flatMap((row) => row.scenarioIds);
const boundScenarioIds = new Set(
  rows.flatMap((row) => row.directlyBoundScenarioIds),
);
const missingUnitRefs = rows.filter(
  (row) => !row.unitFamilySuite && row.unitLiteralReferences.length === 0,
);
const lines = [
  "# Protocol conformance coverage report",
  "",
  `Pinned SDK fixture SHA-256: \`${sdkHash}\` (expected \`${inventory.sdkSha256}\`; ${sdkHash === inventory.sdkSha256 ? "matches" : "MISMATCH"}).`,
  `Registry rows: ${rows.length}; bound to owning family unit suite: ${rows.length - missingUnitRefs.length}; missing owner-suite bindings: ${missingUnitRefs.length}.`,
  `Declared scenario IDs: ${declaredScenarioIds.length}; directly bound to executable test names: ${boundScenarioIds.size}; unbound IDs: ${declaredScenarioIds.length - boundScenarioIds.size}.`,
  "",
  "This is a traceability report, not a Telegram capability or support report. Registry-driven family suites cover rows through generated owner filtering; literal event-name references are reported separately. Only a directly bound scenario ID proves that the named row scenario is attached to a specific test. Missing links remain visible below.",
  "",
  "| Registry ID | Direction / event | Owner | Min version | SDK source literal | Unit coverage references | SDK browser source refs | Scenario IDs not directly bound |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((row) => {
    const missing = row.scenarioIds.filter(
      (testId) => !row.directlyBoundScenarioIds.includes(testId),
    );
    const unitRefs = [
      row.unitFamilySuite && `registry-driven: \`${row.unitFamilySuite}\``,
      ...row.unitLiteralReferences.map((path) => `literal: \`${path}\``),
    ].filter(Boolean);
    return `| ${row.id} | ${row.direction} / \`${row.event}\` | ${row.owner} | ${row.minimumVersion ?? "—"} | ${row.sdkSourceReference ? "yes" : "no"} | ${unitRefs.join("<br>") || "—"} | ${row.browserSourceReferences.map((path) => `\`${path}\``).join("<br>") || "—"} | ${missing.map((testId) => `\`${testId}\``).join("<br>") || "—"} |`;
  }),
  "",
  "## Current interpretation",
  "",
  "- Family unit suites are organized by registry owner and exercise every assigned row through generated owner filtering. Literal event-name references appear separately; this static report does not map individual assertions to registry rows.",
  "- Official SDK browser fixtures exercise all seven API families. The version-boundary suite checks every distinct minimum version declared in the registry, and representative SDK methods are run immediately below and at their version gates.",
  "- The pinned SDK accepts `switchInlineQuery` at 6.6, while the registry and current Mini Apps docs identify 6.7+. The boundary fixture preserves both observations for review; it does not edit the pinned SDK or inventory metadata.",
  "- The seven generic `testIds` per event are not named directly by current executable tests. This report therefore does not claim those row-specific scenarios are individually covered. Convert them into explicit row cases as each family is qualified; do not infer Telegram profile support from fixture presence.",
  "",
];
const report = `${lines.join("\n")}\n`;

if (check) {
  let current = "";
  try {
    current = await readFile(outputPath, "utf8");
  } catch {}
  if (current !== report) {
    console.error("Protocol conformance report is stale; regenerate it.");
    process.exitCode = 1;
  }
  if (
    sdkHash !== inventory.sdkSha256 ||
    rows.some((row) => row.owner === "unassigned")
  ) {
    console.error(
      "Protocol conformance source hash or registry ownership is invalid.",
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, report);
  console.log(`Wrote ${outputPath.slice(root.length + 1)}`);
}

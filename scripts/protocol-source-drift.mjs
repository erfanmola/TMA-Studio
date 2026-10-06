import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = resolve(
  root,
  "apps/studio/src/domain/protocol/inventory.json",
);
const baselinePath = resolve(root, "reports/protocol-source-baseline.json");
const reportPath = resolve(root, "reports/protocol-source-drift-report.md");
const sdkUrl = "https://telegram.org/js/telegram-web-app.js";
const timeoutMs = 20_000;
const args = new Set(process.argv.slice(2));
const reportOnly = args.has("--report-only");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sdkEvents(source) {
  return [
    ...new Set(
      [...source.matchAll(/(?:postEvent|onEvent)\(["']([^"']+)["']/g)]
        .map((match) => match[1])
        .filter((name) => name.startsWith("web_app_") || name !== "webview:"),
    ),
  ].sort();
}

function markdownTable(rows) {
  return rows.length
    ? rows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} |`).join("\n")
    : "| — | OK | — |";
}

const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const expectedEvents = [...baseline.sdkEvents].sort();
const findings = [];
const docRows = [];
const timestamp = new Date().toISOString();
if (inventory.sdkSha256 !== baseline.sdkSha256) {
  findings.push(
    `Inventory SDK SHA-256 differs from the reviewed baseline: inventory \`${inventory.sdkSha256}\`, baseline \`${baseline.sdkSha256}\`. Review the source and update evidence intentionally.`,
  );
}
const inventorySourceUrls = [
  ...new Set(inventory.events.map((event) => event.source.split("#")[0])),
]
  .filter((url) => url !== sdkUrl && !url.startsWith(`${sdkUrl}?`))
  .sort();
const expectedDocs = new Map(
  (baseline.documentationSources ?? []).map((source) => [
    source.url,
    source.sha256,
  ]),
);

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "TMA-Studio-protocol-source-drift/1.0" },
  });
  const body = await response.text();
  return { response, body };
}

let remoteSdkHash = "unavailable";
let remoteEventNames = [];
const localSdk = await readFile(
  resolve(root, "tests/fixtures/official-telegram-sdk/telegram-web-app.js"),
  "utf8",
);
if (sha256(localSdk) !== baseline.sdkSha256) {
  findings.push(
    `Checked-in official SDK fixture differs from the reviewed baseline: expected \`${baseline.sdkSha256}\`, received \`${sha256(localSdk)}\`.`,
  );
}
try {
  const { response, body } = await fetchText(sdkUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  remoteSdkHash = sha256(body);
  remoteEventNames = sdkEvents(body);
  if (remoteSdkHash !== baseline.sdkSha256) {
    findings.push(
      `Official SDK SHA-256 changed: expected \`${baseline.sdkSha256}\`, received \`${remoteSdkHash}\`. Review the upstream diff and refresh the fixture and inventory through their normal review gates.`,
    );
  }
  const added = remoteEventNames.filter(
    (name) => !expectedEvents.includes(name),
  );
  const removed = expectedEvents.filter(
    (name) => !remoteEventNames.includes(name),
  );
  if (added.length || removed.length) {
    findings.push(
      `SDK event names drifted (added: ${added.join(", ") || "none"}; removed: ${removed.join(", ") || "none"}). Review and update the inventory deliberately; this monitor never changes support claims.`,
    );
  }
} catch (error) {
  findings.push(`Official SDK could not be checked: ${error.message}`);
}

const docResults = new Array(inventorySourceUrls.length);
let nextDocIndex = 0;
await Promise.all(
  Array.from({ length: Math.min(6, inventorySourceUrls.length) }, async () => {
    while (nextDocIndex < inventorySourceUrls.length) {
      const index = nextDocIndex++;
      const url = inventorySourceUrls[index];
      try {
        const { response, body } = await fetchText(url);
        const status = response.status;
        docResults[index] = {
          url,
          status,
          hash: sha256(body),
          expectedHash: expectedDocs.get(url) ?? "unbaselined",
          error: response.ok ? "" : `HTTP ${status}`,
        };
        if (
          response.ok &&
          expectedDocs.has(url) &&
          docResults[index].hash !== expectedDocs.get(url)
        ) {
          findings.push(
            `Documentation content changed: ${url} (expected \`${expectedDocs.get(url)}\`, received \`${docResults[index].hash}\`). Review the diff and update the source baseline deliberately.`,
          );
        }
      } catch (error) {
        docResults[index] = {
          url,
          status: "error",
          hash: "—",
          expectedHash: expectedDocs.get(url) ?? "unbaselined",
          error: error.message,
        };
      }
    }
  }),
);
for (const result of docResults) {
  docRows.push([
    `[${result.url}](${result.url})`,
    result.status,
    `expected ${result.expectedHash}; observed ${result.hash}`,
  ]);
  if (result.error)
    findings.push(
      `Documentation source unavailable: ${result.url} (${result.error}).`,
    );
}

const report = [
  "# Protocol source drift report",
  "",
  `Checked: ${timestamp}`,
  `Pinned source: [Telegram Web Apps SDK](${sdkUrl})`,
  `Expected SDK SHA-256: \`${baseline.sdkSha256}\`  `,
  `Observed SDK SHA-256: \`${remoteSdkHash}\`  `,
  `Expected SDK event references: ${expectedEvents.length}; observed: ${remoteEventNames.length}.`,
  "",
  "This report checks upstream sources only. It never edits the protocol inventory, generated registry, or platform support claims.",
  "",
  "## Findings",
  "",
  ...(findings.length
    ? findings.map((finding) => `- ${finding}`)
    : [
        "- No SDK hash or event-reference drift detected; all inventory documentation URLs responded successfully.",
      ]),
  "",
  "## Inventory documentation sources",
  "",
  "| Source | HTTP | Response SHA-256 |",
  "| --- | ---: | --- |",
  markdownTable(docRows),
  "",
  "Changed documentation hashes block pull-request review until the baseline is reviewed. Documentation text and SDK events must be updated through explicit source review; this monitor never changes inventory or support claims.",
  "",
].join("\n");

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, report);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
}
console.log(report);
if (findings.length && !reportOnly) process.exitCode = 1;

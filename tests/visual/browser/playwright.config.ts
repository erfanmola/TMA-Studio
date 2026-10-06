import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = resolve(import.meta.dirname, "../../..");
const port = Number(process.env.VISUAL_PORT ?? "5190");
const output = process.env.VISUAL_OUTPUT ?? resolve(root, ".cache/visual");
const viewport = { height: 1000, width: 1280 };

/**
 * Deterministic browser visual harness. Baselines are platform-specific
 * (font rasterization differs per OS) and are never written implicitly:
 * `updateSnapshots: "none"` makes a missing or changed baseline fail, and
 * acceptance goes through `bun run test:visual:accept` with an explicit scope.
 */
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 0,
      scale: "device",
      threshold: 0.1,
    },
  },
  forbidOnly: true,
  fullyParallel: true,
  outputDir: resolve(output, "artifacts"),
  projects: [
    {
      name: "chromium-dpr1",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1, viewport },
    },
    {
      grep: /@dpr2/,
      name: "chromium-dpr2",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 2, viewport },
    },
  ],
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(output, "results.json") }],
    ["html", { open: "never", outputFolder: resolve(output, "report") }],
  ],
  retries: 0,
  snapshotPathTemplate:
    "{testDir}/baselines/{platform}/{projectName}/{arg}{ext}",
  testDir: ".",
  testMatch: /.*\.pw\.ts$/,
  updateSnapshots: "none",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    colorScheme: "light",
    locale: "en-US",
    serviceWorkers: "block",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun x vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: resolve(root, "apps/studio"),
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: `http://127.0.0.1:${port}/`,
  },
});

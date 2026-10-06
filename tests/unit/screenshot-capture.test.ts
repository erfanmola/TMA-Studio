import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureScreenshot } from "../../apps/studio/bunium/services/screenshot-capture";
import { guestRect } from "../../apps/studio/src/contracts/simulator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test.skipIf(process.platform === "win32")(
  "requests a full-window native PNG using refreshed host geometry",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "tma-capture-service-"));
    temporaryDirectories.push(directory);
    const helper = join(directory, "capture-helper");
    const argumentsFile = join(directory, "arguments.txt");
    await writeFile(
      helper,
      `#!/bin/sh\nif [ "$1" = "--check" ]; then exit 0; fi\nprintf '%s\\n' "$@" > '${argumentsFile}'\n`,
    );
    await chmod(helper, 0o755);

    let dialogTitle = "";
    const host = {
      showOpenDialog: async (options: { title: string }) => {
        dialogTitle = options.title;
        return { canceled: false, paths: [directory] };
      },
    };
    const requestedHost = { width: 500, height: 400 };
    const currentHost = { width: 640, height: 480 };
    const request = {
      requestId: "full-window-check",
      scope: "window" as const,
      side: "top" as const,
      host: requestedHost,
      guest: guestRect(requestedHost, "top"),
    };

    const result = await captureScreenshot(host, request, {
      helperPath: helper,
      now: new Date("2026-09-28T15:00:00.000Z"),
      pid: 1234,
      platform: "darwin",
      title: "TMA Studio — Simulator",
      getGeometry: () => ({
        host: currentHost,
        guest: guestRect(currentHost, "top"),
      }),
    });

    expect(dialogTitle).toBe("Choose a folder for the screenshot");
    expect(result.state).toBe("saved");
    if (result.state !== "saved") return;
    expect(result.fileName).toMatch(/-window\.png$/u);
    expect(await readFile(argumentsFile, "utf8")).toBe(
      [
        "1234",
        "TMA Studio — Simulator",
        "640",
        "480",
        "0",
        "0",
        "640",
        "480",
        "window",
        join(directory, result.fileName),
        "",
      ].join("\n"),
    );
  },
);

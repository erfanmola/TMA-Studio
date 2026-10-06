import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { CaptureRequest } from "../../src/contracts/capture";
import {
  parseCaptureRequest,
  safeCaptureFileName,
} from "../../src/contracts/capture";
import { guestRect } from "../../src/contracts/simulator";

export type ScreenshotOutcome =
  | { state: "saved"; fileName: string }
  | { state: "canceled" }
  | { state: "unavailable" }
  | { state: "failed" };

export interface ScreenshotHost {
  showOpenDialog(options: {
    title: string;
    allowMultiple: false;
    canChooseDirectories: true;
    canCreateDirectories: true;
  }): Promise<{ canceled: boolean; paths: string[] }>;
}

export async function captureScreenshot(
  host: ScreenshotHost,
  request: CaptureRequest,
  options: {
    pid: number;
    title: string;
    helperPath?: string;
    platform?: string;
    now?: Date;
    getGeometry?: () => Pick<CaptureRequest, "host" | "guest">;
  },
): Promise<ScreenshotOutcome> {
  if ((options.platform ?? process.platform) !== "darwin")
    return { state: "unavailable" };
  const helper =
    options.helperPath ?? join(import.meta.dir, "../native/tma-studio-capture");
  try {
    await access(helper, constants.X_OK);
  } catch {
    return { state: "unavailable" };
  }
  const helperStatus = await new Promise<number>((resolve) => {
    const child = spawn(helper, ["--check"], { stdio: "ignore" });
    child.once("error", () => resolve(-1));
    child.once("exit", (code) => resolve(code ?? -1));
  });
  if (helperStatus === 69 || helperStatus !== 0)
    return { state: "unavailable" };
  const selected = await host.showOpenDialog({
    title: "Choose a folder for the screenshot",
    allowMultiple: false,
    canChooseDirectories: true,
    canCreateDirectories: true,
  });
  const directory = selected.paths[0];
  if (selected.canceled || !directory) return { state: "canceled" };
  try {
    await access(directory, constants.W_OK);
  } catch {
    return { state: "failed" };
  }

  const current = parseCaptureRequest({
    ...request,
    ...options.getGeometry?.(),
  });
  if (!current) return { state: "failed" };
  const name = safeCaptureFileName(request.scope, options.now);
  const output = join(directory, name);
  const scopeRect =
    request.scope === "window"
      ? { x: 0, y: 0, width: current.host.width, height: current.host.height }
      : request.scope === "viewport"
        ? current.guest
        : guestRect(current.host, request.side);
  const target = output;
  const args = [
    String(options.pid),
    options.title,
    String(current.host.width),
    String(current.host.height),
    String(scopeRect.x),
    String(scopeRect.y),
    String(scopeRect.width),
    String(scopeRect.height),
    request.scope,
    target,
  ];
  const result = await new Promise<number>((resolve) => {
    const child = spawn(helper, args, { stdio: "ignore" });
    child.once("error", () => resolve(-1));
    child.once("exit", (code) => resolve(code ?? -1));
  });
  if (result !== 0) {
    return { state: "failed" };
  }
  return { state: "saved", fileName: target.slice(directory.length + 1) };
}

import { describe, expect, test } from "bun:test";
import {
  acknowledgeStudioUpdateHealthy,
  resolveUpdateInstallDir,
  runStudioUpdateHealthCheck,
  type StudioUpdateHealthRuntime,
} from "../../apps/studio/bunium/services/update-health";

describe("studio update health integration", () => {
  test("resolves no install dir when the relaunch variable is absent", () => {
    expect(resolveUpdateInstallDir({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      resolveUpdateInstallDir({
        BUNIUM_UPDATE_INSTALL_DIR: "   ",
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  test("trims the relaunch install dir", () => {
    expect(
      resolveUpdateInstallDir({
        BUNIUM_UPDATE_INSTALL_DIR: "  /tmp/app  ",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("/tmp/app");
  });

  test("skips the health check without an install dir or runtime support", async () => {
    const calls: string[] = [];
    const runtime: StudioUpdateHealthRuntime = {
      beginUpdateHealthCheck: async (dir) => {
        calls.push(dir);
        return "pending";
      },
    };
    expect(await runStudioUpdateHealthCheck(runtime, null)).toBe("none");
    expect(calls).toEqual([]);
    expect(await runStudioUpdateHealthCheck({}, "/tmp/app")).toBe("none");
  });

  test("routes begin by install dir and stays fail-closed on throw", async () => {
    const seen: string[] = [];
    const pending: StudioUpdateHealthRuntime = {
      beginUpdateHealthCheck: async (dir) => {
        seen.push(dir);
        return "pending";
      },
    };
    expect(await runStudioUpdateHealthCheck(pending, "/tmp/app")).toBe(
      "pending",
    );
    expect(seen).toEqual(["/tmp/app"]);

    const rolled: StudioUpdateHealthRuntime = {
      beginUpdateHealthCheck: async () => "rolled-back",
    };
    expect(await runStudioUpdateHealthCheck(rolled, "/tmp/app")).toBe(
      "rolled-back",
    );

    const broken: StudioUpdateHealthRuntime = {
      beginUpdateHealthCheck: async () => {
        throw new Error("unavailable");
      },
    };
    expect(await runStudioUpdateHealthCheck(broken, "/tmp/app")).toBe("none");

    const odd = {
      beginUpdateHealthCheck: async () => "bogus",
    } as unknown as StudioUpdateHealthRuntime;
    expect(await runStudioUpdateHealthCheck(odd, "/tmp/app")).toBe("none");
  });

  test("acknowledges only a pending check with passing product health", async () => {
    const seen: string[] = [];
    const runtime: StudioUpdateHealthRuntime = {
      acknowledgeUpdateHealthy: async (dir) => {
        seen.push(dir);
        return true;
      },
    };
    expect(
      await acknowledgeStudioUpdateHealthy(
        runtime,
        "/tmp/app",
        "pending",
        true,
      ),
    ).toBe(true);
    expect(seen).toEqual(["/tmp/app"]);

    expect(
      await acknowledgeStudioUpdateHealthy(runtime, null, "pending", true),
    ).toBe(false);
    expect(
      await acknowledgeStudioUpdateHealthy(runtime, "/tmp/app", "none", true),
    ).toBe(false);
    expect(
      await acknowledgeStudioUpdateHealthy(
        runtime,
        "/tmp/app",
        "rolled-back",
        true,
      ),
    ).toBe(false);
    expect(
      await acknowledgeStudioUpdateHealthy(
        runtime,
        "/tmp/app",
        "pending",
        false,
      ),
    ).toBe(false);
    expect(
      await acknowledgeStudioUpdateHealthy({}, "/tmp/app", "pending", true),
    ).toBe(false);
    expect(seen).toEqual(["/tmp/app"]);
  });

  test("acknowledge stays fail-closed on runtime throw or false", async () => {
    const throwing: StudioUpdateHealthRuntime = {
      acknowledgeUpdateHealthy: async () => {
        throw new Error("unavailable");
      },
    };
    expect(
      await acknowledgeStudioUpdateHealthy(
        throwing,
        "/tmp/app",
        "pending",
        true,
      ),
    ).toBe(false);

    const declining: StudioUpdateHealthRuntime = {
      acknowledgeUpdateHealthy: async () => false,
    };
    expect(
      await acknowledgeStudioUpdateHealthy(
        declining,
        "/tmp/app",
        "pending",
        true,
      ),
    ).toBe(false);
  });
});

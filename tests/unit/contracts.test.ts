import { describe, expect, test } from "bun:test";
import {
  RpcCommandSchema,
  RpcReplySchema,
  RpcRequestSchema,
} from "../../apps/studio/src/contracts/rpc";
import {
  ProjectSchema,
  StudioSettingsSchema,
  ValidationError,
} from "../../apps/studio/src/contracts/schemas";

const project = {
  id: "project-1",
  name: "Local app",
  url: "http://localhost:3000",
  avatarColorIndex: 2,
  identityId: "mock-1",
  defaultMode: "overlay",
  launch: {
    kind: "mock",
    signing: "unsigned",
    startParam: "hello",
    advanced: {},
  },
  splash: {
    title: "Loading",
    lightBackground: "#ffffff",
    darkBackground: "#000000",
    presentation: "project",
  },
  createdAt: "2026-09-25T10:00:00Z",
  updatedAt: "2026-09-25T10:00:00Z",
  revision: 0,
} as const;
const settings = {
  schemaVersion: 1,
  revision: 0,
  locale: "en",
  theme: "system",
  uiScale: 1,
  alwaysOnTop: false,
  restoreWindows: true,
  closeToTray: false,
  hapticFrameShake: true,
  defaultDeviceId: "iphone",
  toolbarSide: "top",
  update: {
    checkAutomatically: true,
    downloadAutomatically: false,
    channel: "stable",
  },
} as const;
const rejects = (fn: () => unknown) => expect(fn).toThrow(ValidationError);

describe("contract boundary schemas", () => {
  test("accepts serializable project, launch variants and settings", () => {
    expect(ProjectSchema.parse(project).launch.kind).toBe("mock");
    expect(
      ProjectSchema.parse({
        ...project,
        launch: { kind: "telegram", bot: "example_bot", context: "main" },
      }).launch.kind,
    ).toBe("telegram");
    expect(StudioSettingsSchema.parse(settings).alwaysOnTop).toBe(false);
    expect(JSON.stringify(ProjectSchema.parse(project))).toBeTruthy();
  });

  test("rejects unknown, oversized, nonfinite and unsafe structured input", () => {
    rejects(() => ProjectSchema.parse({ ...project, surprise: true }));
    rejects(() => ProjectSchema.parse({ ...project, name: "x".repeat(129) }));
    rejects(() => ProjectSchema.parse({ ...project, name: "x".repeat(8_193) }));
    rejects(() =>
      ProjectSchema.parse({
        ...project,
        launch: {
          kind: "telegram",
          bot: "b",
          context: "main",
          token: "secret",
        },
      }),
    );
    rejects(() =>
      ProjectSchema.parse({
        ...project,
        launch: {
          kind: "mock",
          signing: "unsigned",
          advanced: { theme: "dark" },
        },
      }),
    );
    rejects(() =>
      StudioSettingsSchema.parse({ ...settings, uiScale: Number.NaN }),
    );
    rejects(() =>
      ProjectSchema.parse({ ...project, url: "javascript:alert(1)" }),
    );
  });

  test("RPC command and envelope validators share the discriminated command contract", () => {
    const request = {
      protocolVersion: 1,
      requestId: "r1",
      command: { method: "project.create", project },
    };
    expect(RpcRequestSchema.parse(request).command.method).toBe(
      "project.create",
    );
    expect(
      RpcCommandSchema.parse({
        method: "settings.update",
        expectedRevision: 0,
        settings,
      }).method,
    ).toBe("settings.update");
    rejects(() =>
      RpcRequestSchema.parse({
        ...request,
        command: { method: "project.get", projectId: "p", secret: "x" },
      }),
    );
    rejects(() => RpcRequestSchema.parse({ ...request, protocolVersion: 2 }));
    const cyclic: Record<string, unknown> = { method: "settings.get" };
    cyclic.loop = cyclic;
    rejects(() => RpcCommandSchema.parse(cyclic));
    rejects(() =>
      RpcCommandSchema.parse({
        method: "project.update",
        projectId: "p",
        expectedRevision: 0,
        patch: { name: "" },
      }),
    );
    expect(
      RpcReplySchema.parse({
        protocolVersion: 1,
        requestId: "r1",
        ok: false,
        error: { code: "CONFLICT", messageKey: "errors.conflict" },
      }).ok,
    ).toBe(false);
  });
});

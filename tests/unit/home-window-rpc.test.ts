import { describe, expect, test } from "bun:test";
import {
  parseHomeRequest,
  safeHomeReply,
} from "../../apps/studio/src/contracts/home-rpc";
import type { SavedProject } from "../../apps/studio/src/contracts/project-service";
import {
  type ProjectWindowReply,
  safeProjectWindowReply,
} from "../../apps/studio/src/contracts/project-window-rpc";
import { parseStudioWindowRequest } from "../../apps/studio/src/contracts/studio-window-rpc";

describe("Home and native window IPC contracts", () => {
  test("accepts only exact bounded recent-project commands", () => {
    expect(
      parseHomeRequest(
        JSON.stringify({
          requestId: "r-1",
          command: { method: "list-recent" },
        }),
      ),
    ).toEqual({ requestId: "r-1", command: { method: "list-recent" } });
    expect(
      parseHomeRequest({
        requestId: "r-2",
        command: { method: "remove-recent", projectId: "project-1" },
      }),
    ).toEqual({
      requestId: "r-2",
      command: { method: "remove-recent", projectId: "project-1" },
    });
    expect(
      parseHomeRequest({
        requestId: "r-3",
        command: { method: "remove-recent", projectId: "x".repeat(129) },
      }),
    ).toBeNull();
    expect(
      parseHomeRequest({
        requestId: "r-4",
        command: { method: "list-recent", deleteProject: true },
      }),
    ).toBeNull();
    expect(parseHomeRequest("x".repeat(4097))).toBeNull();
  });

  test("validates keyed window actions and rejects unknown routing fields", () => {
    expect(
      parseStudioWindowRequest({
        requestId: "r-1",
        action: { kind: "open-project", projectId: "project-1" },
      }),
    ).toEqual({
      requestId: "r-1",
      action: { kind: "open-project", projectId: "project-1" },
    });
    expect(
      parseStudioWindowRequest({
        requestId: "r-2",
        action: { kind: "settings", target: "javascript:alert(1)" },
      }),
    ).toBeNull();
  });

  test("strips host-only token references from project window replies", () => {
    const saved = {
      hasToken: true,
      project: {
        id: "project-1",
        name: "Safe project",
        url: "https://example.test",
        avatarColorIndex: 0,
        botTokenRef: "secret-vault-reference",
        identityId: "identity-1",
        defaultMode: "overlay",
        launch: { kind: "mock", signing: "unsigned", advanced: {} },
        splash: {
          title: "Safe project",
          lightBackground: "#ffffff",
          darkBackground: "#000000",
          presentation: "project",
        },
        createdAt: "2026-09-27T00:00:00.000Z",
        updatedAt: "2026-09-27T00:00:00.000Z",
        revision: 1,
      },
    } as SavedProject;
    const reply = safeProjectWindowReply("r-1", saved) as ProjectWindowReply;
    expect(reply.ok).toBe(true);
    expect(JSON.stringify(reply)).not.toContain("secret-vault-reference");
    expect(JSON.stringify(reply)).not.toContain("botTokenRef");
    expect(safeHomeReply("r-2", []).ok).toBe(true);
  });
});

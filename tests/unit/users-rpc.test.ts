import { describe, expect, test } from "bun:test";
import { StudioStore } from "../../apps/studio/bunium/services/store";
import { handleUsersRequest } from "../../apps/studio/bunium/services/users-rpc";
import { HostUsersService } from "../../apps/studio/bunium/services/users-service";
import { parseUsersRequest } from "../../apps/studio/src/contracts/users-rpc";

describe("trusted Users IPC boundary", () => {
  test("accepts bounded commands and rejects unknown fields", () => {
    expect(
      parseUsersRequest({
        requestId: "req-1",
        command: { method: "list-identities" },
      }),
    ).not.toBeNull();
    expect(
      parseUsersRequest({
        requestId: "req-1",
        command: { method: "list-identities", accountRef: "secret" },
      }),
    ).toBeNull();
  });

  test("lists persisted identities while redacting vault references", async () => {
    const store = new StudioStore(":memory:");
    try {
      store.createIdentity({
        id: "telegram-1",
        kind: "telegram",
        accountRef: "vault:v1:private-reference",
        profile: {
          telegramId: "765432109",
          firstName: "Fixture",
          isPremium: false,
        },
        status: "ready",
        revision: 1,
      });
      const reply = await handleUsersRequest(
        { requestId: "req-2", command: { method: "list-identities" } },
        new HostUsersService(store),
      );
      expect(reply).toMatchObject({
        requestId: "req-2",
        ok: true,
        result: [{ id: "telegram-1", kind: "telegram" }],
      });
      expect(JSON.stringify(reply)).not.toContain("private-reference");
    } finally {
      store.close();
    }
  });
});

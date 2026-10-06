import { describe, expect, test } from "bun:test";
import { parseStorageRequest } from "../../apps/studio/src/contracts/storage-rpc";

describe("storage RPC boundary (09c)", () => {
  test("parses scan and clear with validated IDs", () => {
    expect(
      parseStorageRequest(
        JSON.stringify({ requestId: "req-1", command: { method: "scan" } }),
      ),
    ).toEqual({ requestId: "req-1", command: { method: "scan" } });
    expect(
      parseStorageRequest({
        requestId: "req-2",
        command: { method: "clear-cache", partitionId: "part-a" },
      }),
    ).toMatchObject({ command: { method: "clear-cache" } });
    expect(
      parseStorageRequest({
        requestId: "req-3",
        command: { method: "clear-site-data", partitionId: "part-a" },
      }),
    ).toMatchObject({ command: { method: "clear-site-data" } });
  });

  test("rejects unknown fields and bad IDs", () => {
    expect(
      parseStorageRequest({
        requestId: "r",
        command: { method: "clear-cache", partitionId: "" },
      }),
    ).toBeNull();
    expect(
      parseStorageRequest({
        requestId: "r",
        command: { method: "scan", extra: 1 },
      }),
    ).toBeNull();
    expect(
      parseStorageRequest({ requestId: "!!!", command: { method: "scan" } }),
    ).toBeNull();
  });
});

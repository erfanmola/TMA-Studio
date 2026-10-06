import { describe, expect, test } from "bun:test";
import { StudioStore } from "../../apps/studio/bunium/services/store";
import {
  HostUpdateStatusService,
  handleUpdateStatusRequest,
} from "../../apps/studio/bunium/services/update-status";
import type { UpdateStatusRecord } from "../../apps/studio/src/contracts/entities";
import {
  parseUpdateStatusRequest,
  safeUpdateStatusReply,
} from "../../apps/studio/src/contracts/update-status-rpc";

const freshRecord = (): UpdateStatusRecord => ({
  revision: 0,
  installed: null,
  lastCheckAt: null,
  lastOutcome: null,
  pending: null,
});

describe("update-status rpc boundary", () => {
  test("parses a get request from objects and JSON strings", () => {
    expect(
      parseUpdateStatusRequest({
        requestId: "req-1",
        command: { method: "get" },
      }),
    ).toEqual({ requestId: "req-1", command: { method: "get" } });
    expect(
      parseUpdateStatusRequest(
        JSON.stringify({ requestId: "req-2", command: { method: "get" } }),
      ),
    ).toEqual({ requestId: "req-2", command: { method: "get" } });
  });

  test("rejects malformed requests", () => {
    expect(parseUpdateStatusRequest(null)).toBeNull();
    expect(parseUpdateStatusRequest(42)).toBeNull();
    expect(parseUpdateStatusRequest("{oops")).toBeNull();
    expect(parseUpdateStatusRequest("x".repeat(4_097))).toBeNull();
    expect(parseUpdateStatusRequest({ command: { method: "get" } })).toBeNull();
    expect(
      parseUpdateStatusRequest({
        requestId: "x".repeat(65),
        command: { method: "get" },
      }),
    ).toBeNull();
    expect(
      parseUpdateStatusRequest({
        requestId: "has space",
        command: { method: "get" },
      }),
    ).toBeNull();
    expect(
      parseUpdateStatusRequest({
        requestId: "ok",
        command: { method: "check" },
      }),
    ).toBeNull();
    expect(
      parseUpdateStatusRequest({
        requestId: "ok",
        command: { method: "get", extra: true },
      }),
    ).toBeNull();
    expect(
      parseUpdateStatusRequest({
        requestId: "ok",
        command: { method: "get" },
        extra: true,
      }),
    ).toBeNull();
    expect(
      parseUpdateStatusRequest({ requestId: "ok", command: null }),
    ).toBeNull();
  });

  test("safe reply echoes valid records and fails closed otherwise", () => {
    const reply = safeUpdateStatusReply("req-1", freshRecord());
    expect(reply).toEqual({
      requestId: "req-1",
      ok: true,
      result: freshRecord(),
    });
    expect(
      safeUpdateStatusReply("req-1", {
        ...freshRecord(),
        revision: -1,
      }),
    ).toEqual({ requestId: "req-1", ok: false, error: "INTERNAL" });
    expect(
      safeUpdateStatusReply("req-1", {
        ...freshRecord(),
        installed: { sequence: 0, version: "0.0.7", channel: "stable" },
      }),
    ).toEqual({ requestId: "req-1", ok: false, error: "INTERNAL" });
  });

  test("handler answers get with the stored record", async () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store);
      service.recordInstalled({
        sequence: 41,
        version: "0.0.7",
        channel: "stable",
      });
      const reply = await handleUpdateStatusRequest(
        { requestId: "req-9", command: { method: "get" } },
        service,
      );
      expect(reply?.ok).toBe(true);
      if (reply?.ok) {
        expect(reply.result.installed?.sequence).toBe(41);
        expect(reply.result.revision).toBeGreaterThan(0);
      }
    } finally {
      store.close();
    }
  });

  test("handler returns null for unparseable payloads", async () => {
    const store = new StudioStore(":memory:");
    try {
      const service = new HostUpdateStatusService(store);
      expect(
        await handleUpdateStatusRequest({ nope: true }, service),
      ).toBeNull();
    } finally {
      store.close();
    }
  });

  test("handler fails closed when the store is unavailable", async () => {
    const store = new StudioStore(":memory:");
    const service = new HostUpdateStatusService(store);
    store.close();
    const reply = await handleUpdateStatusRequest(
      { requestId: "req-closed", command: { method: "get" } },
      service,
    );
    expect(reply).toEqual({
      requestId: "req-closed",
      ok: false,
      error: "INTERNAL",
    });
  });
});

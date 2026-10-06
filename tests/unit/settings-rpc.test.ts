import { describe, expect, test } from "bun:test";
import { defaultSettings } from "../../apps/studio/src/contracts/settings-defaults";
import { parseSettingsRequest } from "../../apps/studio/src/contracts/settings-rpc";

describe("settings RPC boundary (05d)", () => {
  test("parses load and save with validated settings", () => {
    const base = defaultSettings(0);
    expect(
      parseSettingsRequest(
        JSON.stringify({ requestId: "req-1", command: { method: "load" } }),
      ),
    ).toEqual({
      requestId: "req-1",
      command: { method: "load" },
    });
    const save = parseSettingsRequest({
      requestId: "req-2",
      command: { method: "save", expectedRevision: 0, settings: base },
    });
    expect(save?.command).toMatchObject({
      method: "save",
      expectedRevision: 0,
    });
  });

  test("rejects unknown fields, bad revisions and invalid settings", () => {
    const base = defaultSettings(0);
    expect(
      parseSettingsRequest({
        requestId: "r",
        command: { method: "save", expectedRevision: -1, settings: base },
      }),
    ).toBeNull();
    expect(
      parseSettingsRequest({
        requestId: "r",
        command: {
          method: "save",
          expectedRevision: 0,
          settings: { ...base, locale: "xx" },
        },
      }),
    ).toBeNull();
    expect(
      parseSettingsRequest({
        requestId: "r",
        command: {
          method: "save",
          expectedRevision: 0,
          settings: base,
          extra: 1,
        },
      }),
    ).toBeNull();
    expect(
      parseSettingsRequest({ requestId: "!!!", command: { method: "load" } }),
    ).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import {
  WEBA_PROFILE_CAPABILITIES,
  WEBA_PROFILE_REFERENCE,
} from "../../apps/studio/src/profiles/weba/capabilities";

describe("Telegram Web A profile reference", () => {
  test("pins source-derived behavior and keeps fidelity unverified", () => {
    expect(WEBA_PROFILE_REFERENCE.tag).toBe("air_v2.11.5");
    expect(WEBA_PROFILE_REFERENCE.commit).toBe(
      "d915b1b9ae856eb9eae737d1816d9c05df66b1d3",
    );
    expect(WEBA_PROFILE_CAPABILITIES.transport).toBe(
      "iframe-postmessage-with-source-and-origin-validation",
    );
    expect(WEBA_PROFILE_CAPABILITIES.viewport).toEqual({
      expanded: true,
      safeArea: "zero",
      fullscreenContentSafeArea: "top-control-reservation",
    });
    expect(WEBA_PROFILE_CAPABILITIES.effects).toEqual({
      dynamicTheme: "source-confirmed",
      fullscreen: "host-capability-gated",
      modalPopups: "source-confirmed",
      closeConfirmation: "source-confirmed",
    });
    expect(WEBA_PROFILE_CAPABILITIES.presentation).toBe(
      "unverified-without-client-captures",
    );
  });
});

import { describe, expect, test } from "bun:test";
import {
  WEBK_PROFILE_CAPABILITIES,
  WEBK_PROFILE_REFERENCE,
} from "../../apps/studio/src/profiles/webk/capabilities";

describe("Telegram Web K profile reference", () => {
  test("pins the Web K shell structure without claiming a reviewed profile", () => {
    expect(WEBK_PROFILE_REFERENCE.commit).toBe(
      "8125029807ad94a6c35492229113d4386c3a8f52",
    );
    expect(WEBK_PROFILE_CAPABILITIES.shell).toEqual({
      hostPopupHeader: "source-confirmed",
      backAndCloseControls: "source-confirmed",
      iframeComposedWebApp: "source-confirmed",
      dynamicFooterButtons: "source-confirmed",
      fourButtonPositions: "source-confirmed",
      fullscreenControls: "source-confirmed",
    });
    expect(WEBK_PROFILE_CAPABILITIES.fullscreen).toBe(
      "document-fullscreen-with-host-controls",
    );
    expect(WEBK_PROFILE_CAPABILITIES.presentation).toBe(
      "unverified-without-client-captures",
    );
    expect(WEBK_PROFILE_CAPABILITIES.transportDetails).toBe(
      "not-qualified-for-studio-adapter",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { IOS_PROFILE_CAPABILITIES } from "../../apps/studio/src/profiles/ios/capabilities";

describe("iOS presentation capabilities", () => {
  test("declares CEF and illustrative safe areas without claiming WebKit behavior", () => {
    expect(IOS_PROFILE_CAPABILITIES).toEqual({
      engine: "cef",
      webKitBehavior: "not-emulated",
      presentation: "browser-approximation",
      safeAreaMetrics: "illustrative",
      protocolEngine: "shared-core",
      nativeDialogsAndPermissions: "unverified",
    });
  });
});

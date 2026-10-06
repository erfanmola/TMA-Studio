import { describe, expect, test } from "bun:test";
import {
  TDESKTOP_PROFILE_CAPABILITIES,
  TDESKTOP_PROFILE_REFERENCE,
} from "../../apps/studio/src/profiles/tdesktop/capabilities";

describe("Telegram Desktop profile reference", () => {
  test("pins shell observations to a release and does not overstate fidelity", () => {
    expect(TDESKTOP_PROFILE_REFERENCE.tag).toBe("v7.2.9");
    expect(TDESKTOP_PROFILE_REFERENCE.files).toContain(
      "Telegram/Resources/bot_webview_shell_html/body.html",
    );
    expect(TDESKTOP_PROFILE_CAPABILITIES.shell).toEqual({
      headerTitle: "source-confirmed",
      backControl: "source-confirmed",
      menuControl: "source-confirmed",
      closeControl: "source-confirmed",
      footerDisclosure: "source-confirmed",
      footerButtons: "source-confirmed",
      resizableWindowHandles: "source-confirmed",
    });
    expect(TDESKTOP_PROFILE_CAPABILITIES.presentation).toBe(
      "unverified-without-client-captures",
    );
    expect(TDESKTOP_PROFILE_CAPABILITIES.launchModes.overlay).toBe(
      "not-established-by-this-reference",
    );
    expect(TDESKTOP_PROFILE_CAPABILITIES.launchModes.expanded).toBe(
      "not-established-by-this-reference",
    );
  });
});

/** Source-backed observations from Telegram Desktop v7.2.9. */
export const TDESKTOP_PROFILE_REFERENCE = {
  id: "telegram-desktop-v7.2.9-webview-shell",
  tag: "v7.2.9",
  publishedAt: "2026-09-17",
  files: [
    "Telegram/Resources/bot_webview_shell_html/body.html",
    "Telegram/Resources/bot_webview_shell_html/page.css",
    "Telegram/Resources/bot_webview_shell_html/page.js",
    "Telegram/SourceFiles/ui/chat/attach/attach_bot_webview.h",
  ],
  url: "https://github.com/telegramdesktop/tdesktop/tree/v7.2.9/Telegram/Resources/bot_webview_shell_html",
} as const;

/**
 * This records what the pinned source establishes without treating source
 * inspection as visual or native-client qualification.
 */
export const TDESKTOP_PROFILE_CAPABILITIES = {
  protocolEngine: "shared-core",
  shell: {
    headerTitle: "source-confirmed",
    backControl: "source-confirmed",
    menuControl: "source-confirmed",
    closeControl: "source-confirmed",
    footerDisclosure: "source-confirmed",
    footerButtons: "source-confirmed",
    resizableWindowHandles: "source-confirmed",
  },
  presentation: "unverified-without-client-captures",
  lightDarkReadyAndModalScenes: "not-reviewed",
  nativeDialogsAndPermissionPrompts: "not-reviewed",
  launchModes: {
    fullscreenFlag: "source-confirmed",
    overlay: "not-established-by-this-reference",
    expanded: "not-established-by-this-reference",
  },
} as const;

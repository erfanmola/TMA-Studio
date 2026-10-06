/** Source observations pinned to the Telegram Web K repository commit. */
export const WEBK_PROFILE_REFERENCE = {
  id: "telegram-webk-8125029807ad",
  commit: "8125029807ad94a6c35492229113d4386c3a8f52",
  committedAt: "2026-09-25",
  url: "https://github.com/morethanwords/tweb/tree/8125029807ad94a6c35492229113d4386c3a8f52/src/components",
} as const;

/** Source-backed host structure; the Web K client itself has not been captured/reviewed. */
export const WEBK_PROFILE_CAPABILITIES = {
  protocolEngine: "shared-core",
  shell: {
    hostPopupHeader: "source-confirmed",
    backAndCloseControls: "source-confirmed",
    iframeComposedWebApp: "source-confirmed",
    dynamicFooterButtons: "source-confirmed",
    fourButtonPositions: "source-confirmed",
    fullscreenControls: "source-confirmed",
  },
  fullscreen: "document-fullscreen-with-host-controls",
  presentation: "unverified-without-client-captures",
  nativeSheetsAndPermissionPrompts: "not-reviewed",
  transportDetails: "not-qualified-for-studio-adapter",
} as const;

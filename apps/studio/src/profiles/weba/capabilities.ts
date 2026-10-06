/** Source observations pinned to Telegram Web A release air_v2.11.5. */
export const WEBA_PROFILE_REFERENCE = {
  id: "telegram-weba-air-v2.11.5",
  tag: "air_v2.11.5",
  commit: "d915b1b9ae856eb9eae737d1816d9c05df66b1d3",
  releasedAt: "2026-08-11",
  url: "https://github.com/Ajaxy/telegram-tt/tree/d915b1b9ae856eb9eae737d1816d9c05df66b1d3/src/components/modals/browser",
} as const;

/** Source-backed shell facts; no claim that Studio's current shell matches visually. */
export const WEBA_PROFILE_CAPABILITIES = {
  transport: "iframe-postmessage-with-source-and-origin-validation",
  protocolEngine: "shared-core",
  viewport: {
    expanded: true,
    safeArea: "zero",
    fullscreenContentSafeArea: "top-control-reservation",
  },
  presentation: "unverified-without-client-captures",
  effects: {
    dynamicTheme: "source-confirmed",
    fullscreen: "host-capability-gated",
    modalPopups: "source-confirmed",
    closeConfirmation: "source-confirmed",
  },
} as const;

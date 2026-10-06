/** Capability declaration for the iOS presentation running inside Studio's CEF host. */
export const IOS_PROFILE_CAPABILITIES = {
  engine: "cef",
  webKitBehavior: "not-emulated",
  presentation: "browser-approximation",
  safeAreaMetrics: "illustrative",
  protocolEngine: "shared-core",
  nativeDialogsAndPermissions: "unverified",
} as const;

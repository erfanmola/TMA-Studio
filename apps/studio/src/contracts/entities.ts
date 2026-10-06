export const PLATFORMS = [
  "android",
  "ios",
  "tdesktop",
  "macos",
  "weba",
  "webk",
] as const;
export type Platform = (typeof PLATFORMS)[number];
export const LAUNCH_MODES = ["overlay", "expanded", "fullscreen"] as const;
export type LaunchMode = (typeof LAUNCH_MODES)[number];

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface ProfileSnapshot {
  telegramId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium: boolean;
  photoUrl?: string;
}
export type Identity =
  | {
      id: string;
      kind: "mock";
      telegramId: string;
      firstName: string;
      lastName?: string;
      username?: string;
      languageCode: string;
      isPremium: boolean;
      photoUrl?: string;
      revision: number;
    }
  | {
      id: string;
      kind: "telegram";
      accountRef: string;
      profile: Readonly<ProfileSnapshot>;
      refreshedAt?: string;
      status: "ready" | "stale" | "reauthorize";
      revision: number;
    };
export interface MockChat {
  id: string;
  type: "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  photoUrl?: string;
}
export interface MockReceiver {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
}
export type LaunchConfiguration =
  | {
      kind: "mock";
      signing: "unsigned" | "bot-token";
      startParam?: string;
      chat?: MockChat;
      receiver?: MockReceiver;
      advanced: Record<string, string>;
    }
  | {
      kind: "telegram";
      bot: string;
      appShortName?: string;
      startParam?: string;
      context: "main" | "direct" | "attachment";
    };
export interface SplashConfiguration {
  title: string;
  imageAssetId?: string;
  lightBackground: string;
  darkBackground: string;
  presentation: "telegram" | "project";
}
export interface Project {
  id: string;
  name: string;
  url: string;
  avatarColorIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  botTokenRef?: string;
  identityId: string;
  defaultMode: LaunchMode;
  launch: LaunchConfiguration;
  splash: SplashConfiguration;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export interface DevicePreset {
  id: string;
  platform: Platform;
  labelKey: string;
  viewport: { width: number; height: number };
  targetDpr: number;
  safeArea: Insets;
  contentSafeArea: Insets;
  frameAsset: string;
  capabilities: string[];
}
export interface PartitionRecord {
  id: string;
  projectId: string;
  identityId: string;
  platform: Platform;
  isolationProfile: string;
  ephemeral: boolean;
  schemaVersion: number;
}
export type PermissionCapability =
  | "camera"
  | "contacts"
  | "files"
  | "location"
  | "microphone"
  | "biometry";
export interface PermissionGrant {
  id: string;
  projectId: string;
  origin: string;
  identityId: string;
  capability: PermissionCapability;
  navigationGeneration: number;
  mode: "native" | "simulated";
  decision: "allow" | "deny";
}
export interface SimulatorSession {
  id: string;
  projectId: string;
  identityId: string;
  platform: Platform;
  partitionId: string;
  navigationGeneration: number;
  device: DevicePreset;
  mode: LaunchMode;
  active: boolean;
  theme: "light" | "dark";
  lifecycle:
    | "creating"
    | "loading"
    | "ready"
    | "background"
    | "crashed"
    | "closing";
  revision: number;
}
export interface AccountSummary {
  id: string;
  profile: ProfileSnapshot;
  status: "connecting" | "ready" | "stale" | "reauthorize";
  refreshedAt?: string;
  lastErrorCode?: string;
}
export interface StudioSettings {
  schemaVersion: 1;
  revision: number;
  locale: "en" | "ru" | "de" | "fa" | "ar";
  theme: "system" | "light" | "dark";
  uiScale: 1 | 1.125 | 1.25 | 1.5 | 1.75 | 2;
  alwaysOnTop: boolean;
  restoreWindows: boolean;
  closeToTray: boolean;
  hapticFrameShake: boolean;
  defaultDeviceId: string;
  toolbarSide: "top" | "bottom" | "left" | "right";
  screenshotDestinationRef?: string;
  recordingDestinationRef?: string;
  update: {
    checkAutomatically: boolean;
    downloadAutomatically: boolean;
    channel: "stable" | "preview";
  };
}
export type UpdateChannel = "stable" | "preview";
export interface UpdateReleaseDescriptor {
  sequence: number;
  version: string;
  channel: UpdateChannel;
}
export type UpdateCheckOutcome =
  | "up-to-date"
  | "update-available"
  | "runtime-installer-available"
  | "check-failed"
  | "unconfigured";
export interface UpdateStatusRecord {
  revision: number;
  installed: UpdateReleaseDescriptor | null;
  lastCheckAt: string | null;
  lastOutcome: UpdateCheckOutcome | null;
  pending: UpdateReleaseDescriptor | null;
}
export type CapabilityStatus =
  | { status: "verified"; fixtureIds: string[]; referenceId: string }
  | { status: "simulated"; fixtureIds: string[]; limitationKey: string }
  | { status: "unsupported"; reasonKey: string }
  | { status: "unverified"; reasonKey: string };
export interface ProtocolCapability {
  event: string;
  minimumVersion?: string;
  profiles: Record<Platform, CapabilityStatus>;
  inputSchemaId: string;
  replyEvents: string[];
  mockPolicy: "local" | "prompt" | "unsupported";
  realPolicy: "local" | "telegram" | "os" | "unsupported";
  testIds: string[];
  sourceIds: string[];
}

export interface ProjectSnapshot {
  project: Readonly<Project>;
  account: Readonly<AccountSummary> | null;
  revision: number;
}
export type StudioErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INTERNAL";

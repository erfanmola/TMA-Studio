import type {
  AccountSummary,
  CapabilityStatus,
  DevicePreset,
  Identity,
  Insets,
  LaunchConfiguration,
  MockChat,
  MockReceiver,
  PartitionRecord,
  PermissionGrant,
  ProfileSnapshot,
  Project,
  ProjectSnapshot,
  ProtocolCapability,
  SimulatorSession,
  SplashConfiguration,
  StudioSettings,
  UpdateReleaseDescriptor,
  UpdateStatusRecord,
} from "./entities";
import { PLATFORMS } from "./entities";

export interface Schema<T> {
  parse(input: unknown): T;
}
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
const fail = (path: string, reason: string): never => {
  throw new ValidationError(`${path}: ${reason}`);
};
export function assertBoundedSerializable(input: unknown): void {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (value: unknown, depth: number, path: string): void => {
    if (++nodes > 5_000 || depth > 16)
      fail(path, "payload exceeds structural limits");
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "string") {
      if (value.length > 8_192) fail(path, "string exceeds 8192 characters");
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail(path, "number must be finite");
      return;
    }
    if (typeof value !== "object" || value === null) {
      fail(path, "value is not serializable");
    }
    const reference = value as object;
    if (seen.has(reference)) fail(path, "cyclic values are not serializable");
    seen.add(reference);
    if (Array.isArray(value)) {
      if (value.length > 256) fail(path, "array exceeds 256 entries");
      value.forEach((item, index) => {
        visit(item, depth + 1, `${path}[${index}]`);
      });
    } else {
      if (Object.getPrototypeOf(reference) !== Object.prototype)
        fail(path, "expected plain serializable object");
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > 128) fail(path, "object exceeds 128 fields");
      for (const [key, item] of entries)
        visit(item, depth + 1, `${path}.${key}`);
    }
    seen.delete(reference);
  };
  visit(input, 0, "value");
}
const object = (
  v: unknown,
  path: string,
  keys: readonly string[],
): Record<string, unknown> => {
  if (
    v === null ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    return fail(path, "expected plain object");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (!keys.includes(k)) fail(`${path}.${k}`, "unknown field");
  return o;
};
const str = (v: unknown, p: string, max = 256): string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  ![...v].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })
    ? v
    : fail(p, `expected non-empty string (max ${max})`);
const optStr = (
  o: Record<string, unknown>,
  k: string,
  p: string,
  max = 256,
): string | undefined =>
  o[k] === undefined ? undefined : str(o[k], `${p}.${k}`, max);
const bool = (v: unknown, p: string): boolean =>
  typeof v === "boolean" ? v : fail(p, "expected boolean");
const num = (v: unknown, p: string, min = 0, max = 1_000_000): number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fail(p, `expected finite number in [${min}, ${max}]`);
const int = (v: unknown, p: string, min = 0, max = 2_147_483_647): number =>
  Number.isInteger(v) ? num(v, p, min, max) : fail(p, "expected integer");
const oneOf = <T extends string>(
  v: unknown,
  p: string,
  values: readonly T[],
): T =>
  typeof v === "string" && values.includes(v as T)
    ? (v as T)
    : fail(p, `expected one of ${values.join(", ")}`);
const arr = <T>(
  v: unknown,
  p: string,
  parse: (x: unknown, p: string) => T,
  max = 128,
): T[] =>
  Array.isArray(v) && v.length <= max
    ? v.map((x, i) => parse(x, `${p}[${i}]`))
    : fail(p, `expected array (max ${max})`);
const date = (v: unknown, p: string): string => {
  const s = str(v, p, 32);
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(s) &&
    Number.isFinite(Date.parse(s))
    ? s
    : fail(p, "expected ISO UTC timestamp");
};
const schema = <T>(parse: (v: unknown, p: string) => T): Schema<T> => ({
  parse: (input) => {
    assertBoundedSerializable(input);
    return parse(input, "value");
  },
});
const insets = (v: unknown, p: string): Insets => {
  const o = object(v, p, ["top", "right", "bottom", "left"]);
  return {
    top: num(o.top, `${p}.top`),
    right: num(o.right, `${p}.right`),
    bottom: num(o.bottom, `${p}.bottom`),
    left: num(o.left, `${p}.left`),
  };
};
const profile = (v: unknown, p: string): ProfileSnapshot => {
  const o = object(v, p, [
    "telegramId",
    "firstName",
    "lastName",
    "username",
    "languageCode",
    "isPremium",
    "photoUrl",
  ]);
  const r: ProfileSnapshot = {
    telegramId: str(o.telegramId, `${p}.telegramId`, 32),
    firstName: str(o.firstName, `${p}.firstName`, 128),
    isPremium: bool(o.isPremium, `${p}.isPremium`),
  };
  for (const k of [
    "lastName",
    "username",
    "languageCode",
    "photoUrl",
  ] as const) {
    const x = optStr(o, k, p, k === "photoUrl" ? 2048 : 128);
    if (x !== undefined) r[k] = x;
  }
  return r;
};
const mockChat = (v: unknown, p: string): MockChat => {
  const o = object(v, p, ["id", "type", "title", "username", "photoUrl"]);
  const r: MockChat = {
    id: str(o.id, `${p}.id`, 64),
    type: oneOf(o.type, `${p}.type`, ["group", "supergroup", "channel"]),
    title: str(o.title, `${p}.title`, 128),
  };
  for (const k of ["username", "photoUrl"] as const) {
    const x = optStr(o, k, p, k === "photoUrl" ? 2048 : 64);
    if (x !== undefined) r[k] = x;
  }
  return r;
};
const receiver = (v: unknown, p: string): MockReceiver => {
  const o = object(v, p, [
    "id",
    "firstName",
    "lastName",
    "username",
    "languageCode",
    "isPremium",
  ]);
  const r: MockReceiver = {
    id: str(o.id, `${p}.id`, 64),
    firstName: str(o.firstName, `${p}.firstName`, 128),
  };
  for (const k of ["lastName", "username", "languageCode"] as const) {
    const x = optStr(o, k, p, 128);
    if (x !== undefined) r[k] = x;
  }
  if (o.isPremium !== undefined)
    r.isPremium = bool(o.isPremium, `${p}.isPremium`);
  return r;
};
const splash = (v: unknown, p: string): SplashConfiguration => {
  const o = object(v, p, [
    "title",
    "imageAssetId",
    "lightBackground",
    "darkBackground",
    "presentation",
  ]);
  const color = (x: unknown, q: string) => {
    const s = str(x, q, 7);
    return /^#[0-9a-fA-F]{6}$/u.test(s) ? s : fail(q, "expected #RRGGBB color");
  };
  const r: SplashConfiguration = {
    title: str(o.title, `${p}.title`, 128),
    lightBackground: color(o.lightBackground, `${p}.lightBackground`),
    darkBackground: color(o.darkBackground, `${p}.darkBackground`),
    presentation: oneOf(o.presentation, `${p}.presentation`, [
      "telegram",
      "project",
    ]),
  };
  const x = optStr(o, "imageAssetId", p, 128);
  if (x !== undefined) r.imageAssetId = x;
  return r;
};
const launch = (v: unknown, p: string): LaunchConfiguration => {
  if (v === null || typeof v !== "object" || Array.isArray(v))
    return fail(p, "expected launch object");
  const kind = (v as { kind?: unknown }).kind;
  if (kind === "mock") {
    const o = object(v, p, [
      "kind",
      "signing",
      "startParam",
      "chat",
      "receiver",
      "advanced",
    ]);
    if (
      o.advanced === null ||
      typeof o.advanced !== "object" ||
      Array.isArray(o.advanced)
    )
      return fail(`${p}.advanced`, "expected registered override map");
    const raw = o.advanced as Record<string, unknown>;
    if (Object.keys(raw).length > 0)
      return fail(
        `${p}.advanced`,
        "no experimental override keys are registered",
      );
    return {
      kind,
      signing: oneOf(o.signing, `${p}.signing`, ["unsigned", "bot-token"]),
      ...(optStr(o, "startParam", p, 512) !== undefined
        ? { startParam: optStr(o, "startParam", p, 512) }
        : {}),
      ...(o.chat !== undefined ? { chat: mockChat(o.chat, `${p}.chat`) } : {}),
      ...(o.receiver !== undefined
        ? { receiver: receiver(o.receiver, `${p}.receiver`) }
        : {}),
      advanced: {},
    };
  }
  if (kind === "telegram") {
    const o = object(v, p, [
      "kind",
      "bot",
      "appShortName",
      "startParam",
      "context",
    ]);
    const app = optStr(o, "appShortName", p, 64),
      start = optStr(o, "startParam", p, 512);
    return {
      kind,
      bot: str(o.bot, `${p}.bot`, 128),
      context: oneOf(o.context, `${p}.context`, [
        "main",
        "direct",
        "attachment",
      ]),
      ...(app !== undefined ? { appShortName: app } : {}),
      ...(start !== undefined ? { startParam: start } : {}),
    };
  }
  return fail(`${p}.kind`, "unknown launch kind");
};
const project = (v: unknown, p: string): Project => {
  const keys = [
    "id",
    "name",
    "url",
    "avatarColorIndex",
    "botTokenRef",
    "identityId",
    "defaultMode",
    "launch",
    "splash",
    "createdAt",
    "updatedAt",
    "revision",
  ];
  const o = object(v, p, keys);
  const color = int(o.avatarColorIndex, `${p}.avatarColorIndex`, 0, 6);
  const url = str(o.url, `${p}.url`, 2048);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return fail(`${p}.url`, "invalid URL");
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    return fail(`${p}.url`, "only credential-free HTTP(S) URLs are allowed");
  const token = optStr(o, "botTokenRef", p, 128);
  return {
    id: str(o.id, `${p}.id`, 128),
    name: str(o.name, `${p}.name`, 128),
    url,
    avatarColorIndex: color as Project["avatarColorIndex"],
    ...(token !== undefined ? { botTokenRef: token } : {}),
    identityId: str(o.identityId, `${p}.identityId`, 128),
    defaultMode: oneOf(o.defaultMode, `${p}.defaultMode`, [
      "overlay",
      "expanded",
      "fullscreen",
    ]),
    launch: launch(o.launch, `${p}.launch`),
    splash: splash(o.splash, `${p}.splash`),
    createdAt: date(o.createdAt, `${p}.createdAt`),
    updatedAt: date(o.updatedAt, `${p}.updatedAt`),
    revision: int(o.revision, `${p}.revision`),
  };
};
const device = (v: unknown, p: string): DevicePreset => {
  const o = object(v, p, [
    "id",
    "platform",
    "labelKey",
    "viewport",
    "targetDpr",
    "safeArea",
    "contentSafeArea",
    "frameAsset",
    "capabilities",
  ]);
  const vp = object(o.viewport, `${p}.viewport`, ["width", "height"]);
  return {
    id: str(o.id, `${p}.id`, 128),
    platform: oneOf(o.platform, `${p}.platform`, PLATFORMS),
    labelKey: str(o.labelKey, `${p}.labelKey`, 128),
    viewport: {
      width: num(vp.width, `${p}.viewport.width`, 1, 16384),
      height: num(vp.height, `${p}.viewport.height`, 1, 16384),
    },
    targetDpr: num(o.targetDpr, `${p}.targetDpr`, 0.25, 8),
    safeArea: insets(o.safeArea, `${p}.safeArea`),
    contentSafeArea: insets(o.contentSafeArea, `${p}.contentSafeArea`),
    frameAsset: str(o.frameAsset, `${p}.frameAsset`, 128),
    capabilities: arr(o.capabilities, `${p}.capabilities`, (x, q) =>
      str(x, q, 128),
    ),
  };
};
const identity = (v: unknown, p: string): Identity => {
  if (v === null || typeof v !== "object" || Array.isArray(v))
    return fail(p, "expected identity");
  const kind = (v as { kind?: unknown }).kind;
  if (kind === "mock") {
    const o = object(v, p, [
      "id",
      "kind",
      "telegramId",
      "firstName",
      "lastName",
      "username",
      "languageCode",
      "isPremium",
      "photoUrl",
      "revision",
    ]);
    const r: Extract<Identity, { kind: "mock" }> = {
      id: str(o.id, `${p}.id`, 128),
      kind,
      telegramId: str(o.telegramId, `${p}.telegramId`, 32),
      firstName: str(o.firstName, `${p}.firstName`, 128),
      languageCode: str(o.languageCode, `${p}.languageCode`, 32),
      isPremium: bool(o.isPremium, `${p}.isPremium`),
      revision: int(o.revision, `${p}.revision`),
    };
    for (const k of ["lastName", "username", "photoUrl"] as const) {
      const x = optStr(o, k, p, k === "photoUrl" ? 2048 : 128);
      if (x !== undefined) r[k] = x;
    }
    return r;
  }
  if (kind === "telegram") {
    const o = object(v, p, [
      "id",
      "kind",
      "accountRef",
      "profile",
      "refreshedAt",
      "status",
      "revision",
    ]);
    const refreshed =
      o.refreshedAt === undefined
        ? undefined
        : date(o.refreshedAt, `${p}.refreshedAt`);
    return {
      id: str(o.id, `${p}.id`, 128),
      kind,
      accountRef: str(o.accountRef, `${p}.accountRef`, 128),
      profile: profile(o.profile, `${p}.profile`),
      status: oneOf(o.status, `${p}.status`, ["ready", "stale", "reauthorize"]),
      revision: int(o.revision, `${p}.revision`),
      ...(refreshed ? { refreshedAt: refreshed } : {}),
    };
  }
  return fail(`${p}.kind`, "unknown identity kind");
};
const account = (v: unknown, p: string): AccountSummary => {
  const o = object(v, p, [
    "id",
    "profile",
    "status",
    "refreshedAt",
    "lastErrorCode",
  ]);
  const refreshed =
      o.refreshedAt === undefined
        ? undefined
        : date(o.refreshedAt, `${p}.refreshedAt`),
    error = optStr(o, "lastErrorCode", p, 64);
  return {
    id: str(o.id, `${p}.id`, 128),
    profile: profile(o.profile, `${p}.profile`),
    status: oneOf(o.status, `${p}.status`, [
      "connecting",
      "ready",
      "stale",
      "reauthorize",
    ]),
    ...(refreshed ? { refreshedAt: refreshed } : {}),
    ...(error ? { lastErrorCode: error } : {}),
  };
};
const settings = (v: unknown, p: string): StudioSettings => {
  const o = object(v, p, [
    "schemaVersion",
    "revision",
    "locale",
    "theme",
    "uiScale",
    "alwaysOnTop",
    "restoreWindows",
    "closeToTray",
    "hapticFrameShake",
    "defaultDeviceId",
    "toolbarSide",
    "screenshotDestinationRef",
    "recordingDestinationRef",
    "update",
  ]);
  const u = object(o.update, `${p}.update`, [
    "checkAutomatically",
    "downloadAutomatically",
    "channel",
  ]);
  const screenshot = optStr(o, "screenshotDestinationRef", p, 128),
    recording = optStr(o, "recordingDestinationRef", p, 128);
  if (o.schemaVersion !== 1)
    return fail(`${p}.schemaVersion`, "unsupported schema version");
  return {
    schemaVersion: 1,
    revision: int(o.revision, `${p}.revision`),
    locale: oneOf(o.locale, `${p}.locale`, ["en", "ru", "de", "fa", "ar"]),
    theme: oneOf(o.theme, `${p}.theme`, ["system", "light", "dark"]),
    uiScale: (typeof o.uiScale === "number" &&
    [1, 1.125, 1.25, 1.5, 1.75, 2].includes(o.uiScale)
      ? o.uiScale
      : fail(`${p}.uiScale`, "unsupported scale")) as StudioSettings["uiScale"],
    alwaysOnTop: bool(o.alwaysOnTop, `${p}.alwaysOnTop`),
    restoreWindows: bool(o.restoreWindows, `${p}.restoreWindows`),
    closeToTray: bool(o.closeToTray, `${p}.closeToTray`),
    hapticFrameShake: bool(o.hapticFrameShake, `${p}.hapticFrameShake`),
    defaultDeviceId: str(o.defaultDeviceId, `${p}.defaultDeviceId`, 128),
    toolbarSide: oneOf(o.toolbarSide, `${p}.toolbarSide`, [
      "top",
      "bottom",
      "left",
      "right",
    ]),
    ...(screenshot ? { screenshotDestinationRef: screenshot } : {}),
    ...(recording ? { recordingDestinationRef: recording } : {}),
    update: {
      checkAutomatically: bool(
        u.checkAutomatically,
        `${p}.update.checkAutomatically`,
      ),
      downloadAutomatically: bool(
        u.downloadAutomatically,
        `${p}.update.downloadAutomatically`,
      ),
      channel: oneOf(u.channel, `${p}.update.channel`, ["stable", "preview"]),
    },
  };
};
const capability = (v: unknown, p: string): CapabilityStatus => {
  if (v === null || typeof v !== "object" || Array.isArray(v))
    return fail(p, "expected capability status");
  const s = (v as { status?: unknown }).status;
  if (s === "verified" || s === "simulated") {
    const o = object(
      v,
      p,
      s === "verified"
        ? ["status", "fixtureIds", "referenceId"]
        : ["status", "fixtureIds", "limitationKey"],
    );
    return s === "verified"
      ? {
          status: s,
          fixtureIds: arr(o.fixtureIds, `${p}.fixtureIds`, (x, q) =>
            str(x, q, 128),
          ),
          referenceId: str(o.referenceId, `${p}.referenceId`, 128),
        }
      : {
          status: s,
          fixtureIds: arr(o.fixtureIds, `${p}.fixtureIds`, (x, q) =>
            str(x, q, 128),
          ),
          limitationKey: str(o.limitationKey, `${p}.limitationKey`, 128),
        };
  }
  if (s === "unsupported" || s === "unverified") {
    const o = object(v, p, ["status", "reasonKey"]);
    return { status: s, reasonKey: str(o.reasonKey, `${p}.reasonKey`, 128) };
  }
  return fail(`${p}.status`, "unknown status");
};
const protocolCapability = (v: unknown, p: string): ProtocolCapability => {
  const o = object(v, p, [
    "event",
    "minimumVersion",
    "profiles",
    "inputSchemaId",
    "replyEvents",
    "mockPolicy",
    "realPolicy",
    "testIds",
    "sourceIds",
  ]);
  const po = object(o.profiles, `${p}.profiles`, PLATFORMS);
  for (const k of PLATFORMS)
    if (po[k] === undefined)
      return fail(`${p}.profiles.${k}`, "required profile missing");
  const minimum = optStr(o, "minimumVersion", p, 64);
  const policies = ["local", "prompt", "unsupported"] as const;
  const real = ["local", "telegram", "os", "unsupported"] as const;
  return {
    event: str(o.event, `${p}.event`, 128),
    ...(minimum ? { minimumVersion: minimum } : {}),
    profiles: Object.fromEntries(
      PLATFORMS.map((k) => [k, capability(po[k], `${p}.profiles.${k}`)]),
    ) as Record<(typeof PLATFORMS)[number], CapabilityStatus>,
    inputSchemaId: str(o.inputSchemaId, `${p}.inputSchemaId`, 128),
    replyEvents: arr(o.replyEvents, `${p}.replyEvents`, (x, q) =>
      str(x, q, 128),
    ),
    mockPolicy: oneOf(o.mockPolicy, `${p}.mockPolicy`, policies),
    realPolicy: oneOf(o.realPolicy, `${p}.realPolicy`, real),
    testIds: arr(o.testIds, `${p}.testIds`, (x, q) => str(x, q, 128)),
    sourceIds: arr(o.sourceIds, `${p}.sourceIds`, (x, q) => str(x, q, 128)),
  };
};

const updateChannels = ["stable", "preview"] as const;
const updateOutcomes = [
  "up-to-date",
  "update-available",
  "runtime-installer-available",
  "check-failed",
  "unconfigured",
] as const;
const updateVersion = (v: unknown, p: string): string => {
  const s = str(v, p, 32);
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/u.test(s)
    ? s
    : fail(p, "expected version string");
};
const releaseDescriptor = (v: unknown, p: string): UpdateReleaseDescriptor => {
  const o = object(v, p, ["sequence", "version", "channel"]);
  return {
    sequence: int(o.sequence, `${p}.sequence`, 1),
    version: updateVersion(o.version, `${p}.version`),
    channel: oneOf(o.channel, `${p}.channel`, updateChannels),
  };
};
const nullable = <T>(
  v: unknown,
  p: string,
  parse: (x: unknown, q: string) => T,
): T | null =>
  v === null
    ? null
    : v === undefined
      ? fail(p, "expected value or null")
      : parse(v, p);
const updateStatus = (v: unknown, p: string): UpdateStatusRecord => {
  const o = object(v, p, [
    "revision",
    "installed",
    "lastCheckAt",
    "lastOutcome",
    "pending",
  ]);
  return {
    revision: int(o.revision, `${p}.revision`, 0),
    installed: nullable(o.installed, `${p}.installed`, releaseDescriptor),
    lastCheckAt: nullable(o.lastCheckAt, `${p}.lastCheckAt`, date),
    lastOutcome: nullable(o.lastOutcome, `${p}.lastOutcome`, (x, q) =>
      oneOf(x, q, updateOutcomes),
    ),
    pending: nullable(o.pending, `${p}.pending`, releaseDescriptor),
  };
};

export const InsetsSchema = schema(insets);
export const ProfileSnapshotSchema = schema(profile);
export const MockChatSchema = schema(mockChat);
export const MockReceiverSchema = schema(receiver);
export const SplashConfigurationSchema = schema(splash);
export const LaunchConfigurationSchema = schema(launch);
export const ProjectSchema = schema(project);
export const DevicePresetSchema = schema(device);
export const IdentitySchema = schema(identity);
export const AccountSummarySchema = schema(account);
export const StudioSettingsSchema = schema(settings);
export const UpdateStatusRecordSchema = schema(updateStatus);
export const ProtocolCapabilitySchema = schema(protocolCapability);
export const PartitionRecordSchema = schema<PartitionRecord>((v, p) => {
  const o = object(v, p, [
    "id",
    "projectId",
    "identityId",
    "platform",
    "isolationProfile",
    "ephemeral",
    "schemaVersion",
  ]);
  return {
    id: str(o.id, `${p}.id`, 128),
    projectId: str(o.projectId, `${p}.projectId`, 128),
    identityId: str(o.identityId, `${p}.identityId`, 128),
    platform: oneOf(o.platform, `${p}.platform`, PLATFORMS),
    isolationProfile: str(o.isolationProfile, `${p}.isolationProfile`, 128),
    ephemeral: bool(o.ephemeral, `${p}.ephemeral`),
    schemaVersion: int(o.schemaVersion, `${p}.schemaVersion`, 1),
  };
});
export const PermissionGrantSchema = schema<PermissionGrant>((v, p) => {
  const o = object(v, p, [
    "id",
    "projectId",
    "origin",
    "identityId",
    "capability",
    "navigationGeneration",
    "mode",
    "decision",
  ]);
  return {
    id: str(o.id, `${p}.id`, 128),
    projectId: str(o.projectId, `${p}.projectId`, 128),
    origin: str(o.origin, `${p}.origin`, 512),
    identityId: str(o.identityId, `${p}.identityId`, 128),
    capability: oneOf(o.capability, `${p}.capability`, [
      "camera",
      "contacts",
      "files",
      "location",
      "microphone",
      "biometry",
    ]),
    navigationGeneration: int(
      o.navigationGeneration,
      `${p}.navigationGeneration`,
    ),
    mode: oneOf(o.mode, `${p}.mode`, ["native", "simulated"]),
    decision: oneOf(o.decision, `${p}.decision`, ["allow", "deny"]),
  };
});
export const SimulatorSessionSchema = schema<SimulatorSession>((v, p) => {
  const o = object(v, p, [
    "id",
    "projectId",
    "identityId",
    "platform",
    "partitionId",
    "navigationGeneration",
    "device",
    "mode",
    "active",
    "theme",
    "lifecycle",
    "revision",
  ]);
  return {
    id: str(o.id, `${p}.id`, 128),
    projectId: str(o.projectId, `${p}.projectId`, 128),
    identityId: str(o.identityId, `${p}.identityId`, 128),
    platform: oneOf(o.platform, `${p}.platform`, PLATFORMS),
    partitionId: str(o.partitionId, `${p}.partitionId`, 128),
    navigationGeneration: int(
      o.navigationGeneration,
      `${p}.navigationGeneration`,
    ),
    device: device(o.device, `${p}.device`),
    mode: oneOf(o.mode, `${p}.mode`, ["overlay", "expanded", "fullscreen"]),
    active: bool(o.active, `${p}.active`),
    theme: oneOf(o.theme, `${p}.theme`, ["light", "dark"]),
    lifecycle: oneOf(o.lifecycle, `${p}.lifecycle`, [
      "creating",
      "loading",
      "ready",
      "background",
      "crashed",
      "closing",
    ]),
    revision: int(o.revision, `${p}.revision`),
  };
});
export const ProjectSnapshotSchema = schema<ProjectSnapshot>((v, p) => {
  const o = object(v, p, ["project", "account", "revision"]);
  return {
    project: project(o.project, `${p}.project`),
    account: o.account === null ? null : account(o.account, `${p}.account`),
    revision: int(o.revision, `${p}.revision`),
  };
});

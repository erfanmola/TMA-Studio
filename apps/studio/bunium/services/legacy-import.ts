import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  stat,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
  Identity,
  Platform,
  Project,
  StudioSettings,
} from "../../src/contracts/entities";
import type {
  LegacyImportPreview,
  LegacyImportResult,
  LegacyImportWarning,
  LegacyWarningCode,
} from "../../src/contracts/legacy-import-rpc";
import {
  assertBoundedSerializable,
  ValidationError,
} from "../../src/contracts/schemas";
import { validateMockUserFields } from "../../src/contracts/users-service";
import type { StudioStore } from "./store";
import { type SecretVault, VaultUnavailableError } from "./vault";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const LEGACY_PLATFORM_MAP: Readonly<Record<string, Platform>> = {
  android: "android",
  ios: "ios",
  tdesktop: "tdesktop",
  macos: "macos",
  web: "webk",
  weba: "weba",
};
const UI_SCALES: readonly StudioSettings["uiScale"][] = [
  1, 1.125, 1.25, 1.5, 1.75, 2,
];
const BOT_TOKEN = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/u;
const MOCK_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "language_code",
  "is_premium",
  "allows_write_to_pm",
] as const;

export interface LegacyLocatorOptions {
  platform: string;
  homeDirectory: string;
  environment: Readonly<Record<string, string | undefined>>;
}

export function legacyConfigCandidate(
  options: LegacyLocatorOptions,
): string | null {
  const appData =
    options.platform === "win32"
      ? options.environment.APPDATA
      : options.platform === "linux"
        ? options.environment.XDG_CONFIG_HOME ||
          join(options.homeDirectory, ".config")
        : options.platform === "darwin"
          ? join(options.homeDirectory, "Library", "Application Support")
          : null;
  return appData ? join(appData, "tma-studio", "config.json") : null;
}

export class LegacyImportError extends Error {
  constructor(
    readonly code:
      | "INVALID_FILE"
      | "UNSUPPORTED_SCHEMA"
      | "VAULT_UNAVAILABLE"
      | "BACKUP_FAILED"
      | "IMPORT_FAILED",
  ) {
    super(code);
    this.name = "LegacyImportError";
  }
}

interface LegacyUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  languageCode: string;
  isPremium: boolean;
}

interface LegacyProject {
  id: string;
  name: string;
  url: string;
  token?: string;
  platforms: string[];
  profileSettings: number;
}

interface LegacyConfig {
  preferences: Record<string, unknown>;
  projects: LegacyProject[];
  users: LegacyUser[];
  activeUserId?: string;
  theme: StudioSettings["theme"];
  uiScale: StudioSettings["uiScale"];
  alwaysOnTop: boolean;
  hapticFrameShake: boolean;
  warnings: Map<LegacyWarningCode, number>;
  importableTokens: string[];
  platformMappings: Record<string, Platform>;
}

interface SourceFile {
  digest: string;
  parsed: LegacyConfig;
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function addWarning(
  warnings: Map<LegacyWarningCode, number>,
  code: LegacyWarningCode,
  count = 1,
): void {
  if (count > 0) warnings.set(code, (warnings.get(code) ?? 0) + count);
}

function strictKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseLegacyConfig(input: unknown): LegacyConfig {
  try {
    assertBoundedSerializable(input);
  } catch {
    throw new LegacyImportError("INVALID_FILE");
  }
  const root = object(input);
  if (!root || !strictKeys(root, ["schemaVersion", "preferences"]))
    throw new LegacyImportError("UNSUPPORTED_SCHEMA");
  if (root.schemaVersion !== undefined && root.schemaVersion !== 1) {
    throw new LegacyImportError("UNSUPPORTED_SCHEMA");
  }
  const preferences = object(root.preferences);
  const preferenceKeys = [
    "theme_mode",
    "ui",
    "project",
    "intro",
    "tabbar",
    "projects",
    "users",
    "viewport",
  ] as const;
  if (
    !preferences ||
    !strictKeys(preferences, preferenceKeys) ||
    !Array.isArray(preferences.projects) ||
    preferences.projects.length > 256
  ) {
    throw new LegacyImportError("UNSUPPORTED_SCHEMA");
  }

  const warnings = new Map<LegacyWarningCode, number>();
  const userSettings = object(preferences.users);
  const rawUsers = userSettings?.users;
  if (
    !userSettings ||
    !strictKeys(userSettings, ["active", "users"]) ||
    !Array.isArray(rawUsers) ||
    rawUsers.length > 256
  ) {
    throw new LegacyImportError("UNSUPPORTED_SCHEMA");
  }
  if (
    userSettings.active !== undefined &&
    userSettings.active !== "none" &&
    (typeof userSettings.active !== "number" ||
      !Number.isSafeInteger(userSettings.active) ||
      userSettings.active < 0)
  ) {
    throw new LegacyImportError("INVALID_FILE");
  }
  const users: LegacyUser[] = [];
  for (const item of rawUsers) {
    const row = object(item);
    if (!row || !strictKeys(row, MOCK_FIELDS))
      throw new LegacyImportError("UNSUPPORTED_SCHEMA");
    if (
      typeof row.id !== "number" ||
      !Number.isSafeInteger(row.id) ||
      row.id < 0 ||
      typeof row.first_name !== "string" ||
      typeof row.language_code !== "string" ||
      (row.last_name !== undefined && typeof row.last_name !== "string") ||
      (row.username !== undefined && typeof row.username !== "string") ||
      (row.photo_url !== undefined && typeof row.photo_url !== "string") ||
      (row.is_premium !== undefined && typeof row.is_premium !== "boolean") ||
      (row.allows_write_to_pm !== undefined &&
        typeof row.allows_write_to_pm !== "boolean")
    ) {
      throw new LegacyImportError("INVALID_FILE");
    }
    let photoUrl: string | undefined;
    if (typeof row.photo_url === "string") {
      try {
        const url = new URL(row.photo_url);
        if (
          (url.protocol === "http:" || url.protocol === "https:") &&
          !url.username &&
          !url.password &&
          row.photo_url.length <= 2048
        ) {
          photoUrl = row.photo_url;
        } else {
          addWarning(warnings, "invalid-mock-photos-omitted");
        }
      } catch {
        addWarning(warnings, "invalid-mock-photos-omitted");
      }
    }
    users.push({
      id: String(row.id),
      firstName: row.first_name,
      ...(row.last_name ? { lastName: row.last_name } : {}),
      ...(row.username ? { username: row.username } : {}),
      ...(photoUrl ? { photoUrl } : {}),
      languageCode: row.language_code || "en",
      isPremium: row.is_premium === true,
    });
  }

  const projects: LegacyProject[] = [];
  const seenProjectIds = new Set<string>();
  const importableTokens: string[] = [];
  let unknownPlatformCount = 0;
  let selectedSubsetCount = 0;
  const allPlatforms = new Set(Object.values(LEGACY_PLATFORM_MAP));
  for (const item of preferences.projects) {
    const row = object(item);
    if (
      !row ||
      !strictKeys(row, ["id", "name", "url", "token", "settings", "platforms"])
    )
      throw new LegacyImportError("UNSUPPORTED_SCHEMA");
    if (
      typeof row.id !== "string" ||
      !row.id.trim() ||
      row.id.length > 128 ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 128 ||
      typeof row.url !== "string" ||
      row.url.length > 2048 ||
      (row.token !== undefined && typeof row.token !== "string")
    ) {
      throw new LegacyImportError("INVALID_FILE");
    }
    let url: URL;
    try {
      url = new URL(row.url);
    } catch {
      throw new LegacyImportError("INVALID_FILE");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new LegacyImportError("INVALID_FILE");
    }
    if (seenProjectIds.has(row.id)) throw new LegacyImportError("INVALID_FILE");
    seenProjectIds.add(row.id);
    const rawPlatforms = row.platforms ?? [];
    if (!Array.isArray(rawPlatforms) || rawPlatforms.length > 32)
      throw new LegacyImportError("INVALID_FILE");
    const mapped = new Set<Platform>();
    for (const raw of rawPlatforms) {
      if (typeof raw !== "string") throw new LegacyImportError("INVALID_FILE");
      const platform = LEGACY_PLATFORM_MAP[raw];
      if (!platform) unknownPlatformCount++;
      else mapped.add(platform);
    }
    if (mapped.size > 0 && mapped.size < allPlatforms.size)
      selectedSubsetCount++;

    const profileSettings = object(row.settings ?? {});
    if (!profileSettings) throw new LegacyImportError("INVALID_FILE");
    let configuredProfileCount = 0;
    for (const [platformName, rawSettings] of Object.entries(profileSettings)) {
      const platform = LEGACY_PLATFORM_MAP[platformName];
      const perPlatform = object(rawSettings);
      if (!platform || !perPlatform) {
        unknownPlatformCount++;
        continue;
      }
      if (!strictKeys(perPlatform, ["open", "expanded", "mode", "floating"]))
        throw new LegacyImportError("UNSUPPORTED_SCHEMA");
      configuredProfileCount++;
      if (
        (perPlatform.open !== undefined &&
          typeof perPlatform.open !== "boolean") ||
        (perPlatform.expanded !== undefined &&
          typeof perPlatform.expanded !== "boolean") ||
        (perPlatform.floating !== undefined &&
          typeof perPlatform.floating !== "boolean") ||
        (perPlatform.mode !== undefined &&
          perPlatform.mode !== "light" &&
          perPlatform.mode !== "dark")
      ) {
        throw new LegacyImportError("INVALID_FILE");
      }
    }
    addWarning(
      warnings,
      "per-profile-window-state-not-imported",
      configuredProfileCount,
    );
    let token: string | undefined;
    if (typeof row.token === "string" && row.token.length > 0) {
      if (BOT_TOKEN.test(row.token)) {
        token = row.token;
        importableTokens.push(token);
      } else {
        addWarning(warnings, "invalid-bot-tokens-not-imported");
      }
    }
    projects.push({
      id: row.id,
      name: row.name,
      url: row.url,
      ...(token ? { token } : {}),
      platforms: rawPlatforms,
      profileSettings: configuredProfileCount,
    });
  }
  addWarning(warnings, "unsupported-platforms-skipped", unknownPlatformCount);
  addWarning(
    warnings,
    "legacy-profile-choices-not-retained",
    selectedSubsetCount,
  );

  const rawActive = userSettings.active;
  const activeUserId =
    typeof rawActive === "number" &&
    Number.isSafeInteger(rawActive) &&
    rawActive >= 0
      ? String(rawActive)
      : undefined;
  if (
    activeUserId === undefined ||
    !users.some((user) => user.id === activeUserId)
  ) {
    addWarning(warnings, "active-mock-user-unavailable");
  }

  const rawUi = object(preferences.ui) ?? {};
  const rawProjectPreferences = object(preferences.project) ?? {};
  if (
    (preferences.ui !== undefined && !object(preferences.ui)) ||
    (preferences.project !== undefined && !object(preferences.project))
  ) {
    throw new LegacyImportError("INVALID_FILE");
  }
  for (const raw of [
    rawUi.scale,
    rawProjectPreferences.floating_window_on_top,
    rawProjectPreferences.shake_on_haptic,
  ]) {
    if (
      raw !== undefined &&
      typeof raw !== "number" &&
      typeof raw !== "boolean"
    ) {
      addWarning(warnings, "unsupported-preferences-skipped");
    }
  }
  const rawScale = rawUi.scale;
  const uiScale =
    typeof rawScale === "number" &&
    UI_SCALES.includes(rawScale as StudioSettings["uiScale"])
      ? (rawScale as StudioSettings["uiScale"])
      : 1;
  if (rawScale !== undefined && uiScale !== rawScale)
    addWarning(warnings, "unsupported-preferences-skipped");
  const rawTheme = preferences.theme_mode;
  const theme: StudioSettings["theme"] =
    rawTheme === "light" || rawTheme === "dark" ? rawTheme : "system";
  if (rawTheme !== undefined && theme === "system")
    addWarning(warnings, "unsupported-preferences-skipped");
  for (const key of ["floating_window_size", "macos_vibrate_on_haptic"]) {
    if (rawProjectPreferences[key] !== undefined)
      addWarning(warnings, "unsupported-preferences-skipped");
  }
  const tabbar = object(preferences.tabbar);
  if (tabbar && (tabbar.active !== undefined || tabbar.tabs !== undefined))
    addWarning(warnings, "unsupported-preferences-skipped");
  const uiSidebar = object(rawUi.sidebar);
  if (uiSidebar) addWarning(warnings, "unsupported-preferences-skipped");
  if (preferences.viewport !== undefined)
    addWarning(warnings, "unsupported-preferences-skipped");

  const platformMappings = { ...LEGACY_PLATFORM_MAP };
  return {
    preferences,
    projects,
    users,
    ...(activeUserId ? { activeUserId } : {}),
    theme,
    uiScale,
    alwaysOnTop: rawProjectPreferences.floating_window_on_top === true,
    hapticFrameShake: rawProjectPreferences.shake_on_haptic === true,
    warnings,
    importableTokens,
    platformMappings,
  };
}

function warningList(
  warnings: Map<LegacyWarningCode, number>,
): LegacyImportWarning[] {
  return [...warnings]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

function uuidV5(name: string): string {
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const hash = createHash("sha1").update(namespace).update(name).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function projectAvatarColor(id: string): Project["avatarColorIndex"] {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 7) as Project["avatarColorIndex"];
}

function emptyStudioSettings(parsed: LegacyConfig): StudioSettings {
  return {
    schemaVersion: 1,
    revision: 1,
    locale: "en",
    theme: parsed.theme,
    uiScale: parsed.uiScale,
    alwaysOnTop: parsed.alwaysOnTop,
    restoreWindows: true,
    closeToTray: false,
    hapticFrameShake: parsed.hapticFrameShake,
    defaultDeviceId: "iphone",
    toolbarSide: "top",
    update: {
      checkAutomatically: true,
      downloadAutomatically: false,
      channel: "stable",
    },
  };
}

export interface LegacyImportServiceOptions {
  backupDirectory: string;
  platform?: string;
  homeDirectory?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  newId?: () => string;
  now?: () => Date;
}

export class LegacyImportService {
  private busy = false;
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly store: StudioStore,
    private readonly vault: SecretVault,
    private readonly options: LegacyImportServiceOptions,
  ) {
    this.id = options.newId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async detect(): Promise<
    { found: false } | { found: true; preview: LegacyImportPreview }
  > {
    const path = legacyConfigCandidate({
      platform: this.options.platform ?? process.platform,
      homeDirectory: this.options.homeDirectory ?? homedir(),
      environment: this.options.environment ?? process.env,
    });
    if (!path || !(await isRegularNonSymlinkFile(path)))
      return { found: false };
    return { found: true, preview: await this.previewFile(path) };
  }

  async previewFile(sourcePath: string): Promise<LegacyImportPreview> {
    const source = await this.readSource(sourcePath);
    return this.preview(source);
  }

  async importFile(sourcePath: string): Promise<LegacyImportResult> {
    if (this.busy) throw new LegacyImportError("IMPORT_FAILED");
    this.busy = true;
    try {
      const source = await this.readSource(sourcePath);
      const preview = this.preview(source);
      const existing = this.store.getLegacyImport(source.digest);
      if (existing?.status === "completed") {
        return {
          ...preview,
          status: "already-imported",
          importedIdentityCount: existing.summary?.identities ?? 0,
          importedProjectCount: existing.summary?.projects ?? 0,
          preferencesImported: false,
        };
      }
      if (
        source.parsed.importableTokens.length > 0 &&
        (this.vault.status.mode !== "system" || !this.vault.setWithReference)
      ) {
        throw new LegacyImportError("VAULT_UNAVAILABLE");
      }

      const references =
        existing?.status === "staged"
          ? existing.vaultReferences
          : source.parsed.importableTokens.map(() => `vault:v1:${this.id()}`);
      if (references.length !== source.parsed.importableTokens.length)
        throw new LegacyImportError("IMPORT_FAILED");
      const journal = this.store.beginLegacyImport(
        source.digest,
        this.now().toISOString(),
        references,
      );
      if (journal.status === "completed") {
        return {
          ...preview,
          status: "already-imported",
          importedIdentityCount: journal.summary?.identities ?? 0,
          importedProjectCount: journal.summary?.projects ?? 0,
          preferencesImported: false,
        };
      }
      if (
        journal.vaultReferences.length !== source.parsed.importableTokens.length
      )
        throw new LegacyImportError("IMPORT_FAILED");

      const backupPath = await this.backup(sourcePath, source);
      const backupDigest = createHash("sha256")
        .update(await readFile(backupPath))
        .digest("hex");
      if (backupDigest !== source.digest)
        throw new LegacyImportError("BACKUP_FAILED");

      const referencesByProject = new Map<string, string>();
      const storedReferences: string[] = [];
      let referenceIndex = 0;
      try {
        for (const project of source.parsed.projects) {
          if (!project.token || !BOT_TOKEN.test(project.token)) continue;
          const reference = journal.vaultReferences[referenceIndex++];
          if (!reference || !this.vault.setWithReference)
            throw new LegacyImportError("VAULT_UNAVAILABLE");
          await this.vault.setWithReference(project.token, reference);
          storedReferences.push(reference);
          referencesByProject.set(project.id, reference);
        }
        const current = this.store.getSnapshot();
        const converted = this.convert(
          source,
          current.projects.map((project) => project.id),
          current.settings !== null,
          referencesByProject,
        );
        const originalBeforeCommit = await this.readSource(sourcePath);
        if (originalBeforeCommit.digest !== source.digest)
          throw new LegacyImportError("INVALID_FILE");
        const commit = this.store.completeLegacyImport({
          sourceDigest: source.digest,
          completedAt: this.now().toISOString(),
          identities: converted.identities,
          projects: converted.projects,
          settings: converted.settings,
          summary: {
            projects: converted.projects.length,
            identities: converted.identities.length,
            tokens: source.parsed.importableTokens.length,
            warnings: converted.warnings.length,
          },
        });
        return {
          ...preview,
          warnings: converted.warnings,
          status: commit.alreadyImported ? "already-imported" : "imported",
          importedIdentityCount: converted.identities.length,
          importedProjectCount: converted.projects.length,
          preferencesImported: commit.preferencesImported,
        };
      } catch (error) {
        await Promise.all(
          storedReferences.map((reference) =>
            this.vault.delete(reference).catch(() => false),
          ),
        );
        if (error instanceof LegacyImportError) throw error;
        if (error instanceof VaultUnavailableError)
          throw new LegacyImportError("VAULT_UNAVAILABLE");
        throw new LegacyImportError("IMPORT_FAILED");
      }
    } finally {
      this.busy = false;
    }
  }

  private preview(source: SourceFile): LegacyImportPreview {
    return {
      sourceSha256: source.digest,
      projectCount: source.parsed.projects.length,
      mockUserCount: source.parsed.users.length,
      importableTokenCount: source.parsed.importableTokens.length,
      warnings: warningList(source.parsed.warnings),
      platformMappings: source.parsed.platformMappings,
    };
  }

  private async readSource(sourcePath: string): Promise<SourceFile> {
    try {
      if (!(await isRegularNonSymlinkFile(sourcePath)))
        throw new LegacyImportError("INVALID_FILE");
      const before = await stat(sourcePath);
      if (before.size > MAX_SOURCE_BYTES)
        throw new LegacyImportError("INVALID_FILE");
      const bytes = await readFile(sourcePath);
      if (bytes.byteLength > MAX_SOURCE_BYTES)
        throw new LegacyImportError("INVALID_FILE");
      const digest = createHash("sha256").update(bytes).digest("hex");
      const after = await readFile(sourcePath);
      if (
        createHash("sha256").update(after).digest("hex") !== digest ||
        before.size !== after.byteLength
      ) {
        throw new LegacyImportError("INVALID_FILE");
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const input = JSON.parse(text.replace(/^\uFEFF/u, "")) as unknown;
      return { digest, parsed: parseLegacyConfig(input) };
    } catch (error) {
      if (error instanceof LegacyImportError) throw error;
      if (error instanceof ValidationError)
        throw new LegacyImportError("INVALID_FILE");
      throw new LegacyImportError("INVALID_FILE");
    }
  }

  private async backup(
    sourcePath: string,
    source: SourceFile,
  ): Promise<string> {
    const directory = resolve(this.options.backupDirectory);
    const target = join(directory, legacyImportBackupName(source.digest));
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700).catch(() => {});
      if (await isRegularNonSymlinkFile(target)) {
        const existing = createHash("sha256")
          .update(await readFile(target))
          .digest("hex");
        if (existing !== source.digest)
          throw new LegacyImportError("BACKUP_FAILED");
        return target;
      }
      await copyFile(sourcePath, target, 1);
      await chmod(target, 0o600).catch(() => {});
      const copied = createHash("sha256")
        .update(await readFile(target))
        .digest("hex");
      const original = createHash("sha256")
        .update(await readFile(sourcePath))
        .digest("hex");
      if (copied !== source.digest || original !== source.digest)
        throw new LegacyImportError("BACKUP_FAILED");
      return target;
    } catch (error) {
      if (error instanceof LegacyImportError) throw error;
      throw new LegacyImportError("BACKUP_FAILED");
    }
  }

  private convert(
    source: SourceFile,
    existingProjectIds: readonly string[],
    settingsAlreadyExist: boolean,
    tokenReferences: ReadonlyMap<string, string>,
  ): {
    identities: Identity[];
    projects: Project[];
    settings: StudioSettings | null;
    warnings: LegacyImportWarning[];
  } {
    const parsed = source.parsed;
    const warnings = new Map(parsed.warnings);
    const existingIdentities = this.store.listIdentities();
    const mockByTelegramId = new Map(
      existingIdentities
        .filter((identity) => identity.kind === "mock")
        .map((identity) => [identity.telegramId, identity]),
    );
    const takenIdentityIds = new Set(existingIdentities.map(({ id }) => id));
    const identityByLegacyTelegramId = new Map<string, string>();
    const identities: Identity[] = [];
    for (const user of parsed.users) {
      const normalized = validateMockUserFields({
        telegramId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        languageCode: user.languageCode,
        isPremium: user.isPremium,
        photoUrl: user.photoUrl,
      });
      const existing = mockByTelegramId.get(normalized.telegramId);
      if (existing) {
        identityByLegacyTelegramId.set(user.id, existing.id);
        if (
          existing.firstName !== normalized.firstName ||
          existing.lastName !== normalized.lastName ||
          existing.username !== normalized.username ||
          existing.languageCode !== normalized.languageCode ||
          existing.isPremium !== normalized.isPremium
        ) {
          addWarning(warnings, "duplicate-mock-users-deduplicated");
        }
        continue;
      }
      const identityId = uniqueDeterministicId(
        source.digest,
        `mock:${user.id}`,
        takenIdentityIds,
      );
      takenIdentityIds.add(identityId);
      identityByLegacyTelegramId.set(user.id, identityId);
      identities.push({
        ...normalized,
        id: identityId,
        kind: "mock",
        revision: 1,
      });
      mockByTelegramId.set(
        normalized.telegramId,
        identities[identities.length - 1] as Extract<
          Identity,
          { kind: "mock" }
        >,
      );
    }

    const activeIdentityId = parsed.activeUserId
      ? identityByLegacyTelegramId.get(parsed.activeUserId)
      : undefined;
    let guestIdentityId = activeIdentityId;
    if (!guestIdentityId) {
      const existingGuest = mockByTelegramId.get("0");
      if (existingGuest) {
        guestIdentityId = existingGuest.id;
      } else {
        const id = uniqueDeterministicId(
          source.digest,
          "mock:guest",
          takenIdentityIds,
        );
        takenIdentityIds.add(id);
        guestIdentityId = id;
        identities.push({
          id,
          kind: "mock",
          telegramId: "0",
          firstName: "Guest",
          languageCode: "en",
          isPremium: false,
          revision: 1,
        });
      }
    }

    const takenProjectIds = new Set(existingProjectIds);
    const now = this.now().toISOString();
    const projects: Project[] = parsed.projects.map((legacy) => {
      let id = legacy.id;
      if (takenProjectIds.has(id)) {
        id = uniqueDeterministicId(
          source.digest,
          `project:${legacy.id}`,
          takenProjectIds,
        );
        addWarning(warnings, "colliding-project-ids-remapped");
      }
      takenProjectIds.add(id);
      const tokenRef = tokenReferences.get(legacy.id);
      return {
        id,
        name: legacy.name,
        url: legacy.url,
        avatarColorIndex: projectAvatarColor(legacy.id),
        ...(tokenRef ? { botTokenRef: tokenRef } : {}),
        identityId: guestIdentityId as string,
        defaultMode: "expanded",
        launch: {
          kind: "mock",
          signing: tokenRef ? "bot-token" : "unsigned",
          advanced: {},
        },
        splash: {
          title: legacy.name,
          lightBackground: "#FFFFFF",
          darkBackground: "#19191B",
          presentation: "telegram",
        },
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };
    });
    const finalWarnings = warningList(warnings);
    if (settingsAlreadyExist)
      finalWarnings.push({ code: "existing-preferences-retained", count: 1 });
    return {
      identities,
      projects,
      settings: settingsAlreadyExist ? null : emptyStudioSettings(parsed),
      warnings: finalWarnings.sort((left, right) =>
        left.code.localeCompare(right.code),
      ),
    };
  }
}

function uniqueDeterministicId(
  digest: string,
  key: string,
  taken: ReadonlySet<string>,
): string {
  for (let suffix = 0; suffix < 100; suffix++) {
    const value = uuidV5(`${digest}:${key}:${suffix}`);
    if (!taken.has(value)) return value;
  }
  throw new LegacyImportError("IMPORT_FAILED");
}

async function isRegularNonSymlinkFile(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

export function legacyImportBackupName(sourceSha256: string): string {
  if (!/^[0-9a-f]{64}$/u.test(sourceSha256))
    throw new LegacyImportError("INVALID_FILE");
  return `legacy-${sourceSha256}.config.json`;
}

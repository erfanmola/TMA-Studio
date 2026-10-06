import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify,
} from "node:crypto";
import type {
  Identity,
  LaunchConfiguration,
  Platform,
  Project,
} from "../../src/contracts/entities";
import type { AccountClientFactory } from "./account-service";
import type { StudioStore } from "./store";
import type { SecretVault } from "./vault";

export type TelegramLaunchContext = "main" | "direct" | "attachment";
export type LaunchVerification =
  | {
      mode: "telegram";
      telegramId: string;
      botId: string;
      context: TelegramLaunchContext;
      startParam?: string;
      authDate: number;
    }
  | {
      mode: "mock";
      telegramId: string;
      context: "mock";
      startParam?: string;
      authDate?: number;
      signing: "unsigned" | "bot-token";
    };

export class LaunchValidationError extends Error {
  constructor(
    readonly code:
      | "INVALID_DATA"
      | "EXPIRED"
      | "IDENTITY_MISMATCH"
      | "CONTEXT_MISMATCH"
      | "UNAVAILABLE",
  ) {
    super(code);
    this.name = "LaunchValidationError";
  }
}

const TELEGRAM_ED25519_KEYS: Record<"production" | "test", string> = {
  production:
    "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d",
  test: "40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec",
};
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const DEFAULT_MAX_AGE_SECONDS = 86_400;
const FUTURE_SKEW_SECONDS = 30;

type ParsedInitData = {
  fields: Map<string, string>;
  authDate: number;
  telegramId: string;
  startParam?: string;
};

function parseInitData(
  raw: string,
  now: number,
  maxAgeSeconds: number,
): ParsedInitData {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 16_384)
    throw new LaunchValidationError("INVALID_DATA");
  const fields = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(raw)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key) || fields.has(key))
      throw new LaunchValidationError("INVALID_DATA");
    fields.set(key, value);
  }
  const dateText = fields.get("auth_date");
  if (!dateText || !/^\d{1,12}$/u.test(dateText))
    throw new LaunchValidationError("INVALID_DATA");
  const authDate = Number(dateText);
  if (!Number.isSafeInteger(authDate))
    throw new LaunchValidationError("INVALID_DATA");
  if (authDate > now + FUTURE_SKEW_SECONDS || now - authDate > maxAgeSeconds)
    throw new LaunchValidationError("EXPIRED");
  let user: unknown;
  try {
    user = JSON.parse(fields.get("user") ?? "null");
  } catch {
    throw new LaunchValidationError("INVALID_DATA");
  }
  if (!user || typeof user !== "object" || !("id" in user))
    throw new LaunchValidationError("INVALID_DATA");
  const id = (user as { id?: unknown }).id;
  if (
    !(typeof id === "string" && /^\d{1,20}$/u.test(id)) &&
    !(typeof id === "number" && Number.isSafeInteger(id) && id > 0)
  )
    throw new LaunchValidationError("INVALID_DATA");
  const startParam = fields.get("start_param");
  return {
    fields,
    authDate,
    telegramId: String(id),
    ...(startParam !== undefined ? { startParam } : {}),
  };
}

function dataCheckString(
  fields: Map<string, string>,
  excluded: ReadonlySet<string>,
): string {
  return [...fields]
    .filter(([key]) => !excluded.has(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function equalHex(actual: string | undefined, expected: Buffer): boolean {
  if (!actual || !/^[a-f\d]{64}$/iu.test(actual)) return false;
  const bytes = Buffer.from(actual, "hex");
  return bytes.length === expected.length && timingSafeEqual(bytes, expected);
}

function validateBinding(
  parsed: ParsedInitData,
  identity: Identity,
  expectedStartParam?: string,
): void {
  if (
    identity.kind !== "telegram" ||
    identity.status !== "ready" ||
    parsed.telegramId !== identity.profile.telegramId
  )
    throw new LaunchValidationError("IDENTITY_MISMATCH");
  if (expectedStartParam !== parsed.startParam)
    throw new LaunchValidationError("CONTEXT_MISMATCH");
}

/** Validate Telegram's third-party Ed25519 signature, then bind signed user data to a ready host Telegram identity. */
export function verifyTelegramLaunch(options: {
  initData: string;
  botId: string;
  identity: Identity;
  context: TelegramLaunchContext;
  expectedContext: TelegramLaunchContext;
  expectedStartParam?: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
  environment?: "production" | "test";
  publicKeyHex?: string;
}): Extract<LaunchVerification, { mode: "telegram" }> {
  if (options.context !== options.expectedContext)
    throw new LaunchValidationError("CONTEXT_MISMATCH");
  if (!/^\d{1,20}$/u.test(options.botId))
    throw new LaunchValidationError("INVALID_DATA");
  const parsed = parseInitData(
    options.initData,
    options.nowSeconds ?? Math.floor(Date.now() / 1000),
    options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
  );
  validateBinding(parsed, options.identity, options.expectedStartParam);
  const encodedSignature = parsed.fields.get("signature");
  if (!encodedSignature || !/^[A-Za-z\d_-]{86}$/u.test(encodedSignature))
    throw new LaunchValidationError("INVALID_DATA");
  const signature = Buffer.from(encodedSignature, "base64url");
  if (signature.length !== 64) throw new LaunchValidationError("INVALID_DATA");
  const check = `${options.botId}:WebAppData\n${dataCheckString(parsed.fields, new Set(["hash", "signature"]))}`;
  const keyHex =
    options.publicKeyHex ??
    TELEGRAM_ED25519_KEYS[options.environment ?? "production"];
  if (!/^[a-f\d]{64}$/iu.test(keyHex))
    throw new LaunchValidationError("UNAVAILABLE");
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(keyHex, "hex")]),
    format: "der",
    type: "spki",
  });
  if (!verify(null, Buffer.from(check), key, signature))
    throw new LaunchValidationError("INVALID_DATA");
  return {
    mode: "telegram",
    telegramId: parsed.telegramId,
    botId: options.botId,
    context: options.context,
    ...(parsed.startParam !== undefined
      ? { startParam: parsed.startParam }
      : {}),
    authDate: parsed.authDate,
  };
}

/** Mock fixtures are always labelled mock, including when their bot-token HMAC is valid. */
export function verifyMockLaunch(options: {
  launch: Extract<LaunchConfiguration, { kind: "mock" }>;
  identity: Identity;
  initData?: string;
  botToken?: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}): LaunchVerification {
  const { launch, identity } = options;
  if (identity.kind !== "mock")
    throw new LaunchValidationError("IDENTITY_MISMATCH");
  if (launch.signing === "unsigned") {
    if (options.initData) throw new LaunchValidationError("INVALID_DATA");
    return {
      mode: "mock",
      telegramId: identity.telegramId,
      context: "mock",
      ...(launch.startParam !== undefined
        ? { startParam: launch.startParam }
        : {}),
      signing: "unsigned",
    };
  }
  const token = options.botToken;
  if (
    !token ||
    !/^\d{5,16}:[A-Za-z0-9_-]{30,64}$/u.test(token) ||
    !options.initData
  )
    throw new LaunchValidationError("INVALID_DATA");
  const parsed = parseInitData(
    options.initData,
    options.nowSeconds ?? Math.floor(Date.now() / 1000),
    options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
  );
  if (
    parsed.telegramId !== identity.telegramId ||
    parsed.startParam !== launch.startParam
  )
    throw new LaunchValidationError("IDENTITY_MISMATCH");
  const suppliedHash = parsed.fields.get("hash");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString(parsed.fields, new Set(["hash"])))
    .digest();
  if (!equalHex(suppliedHash, expected))
    throw new LaunchValidationError("INVALID_DATA");
  return {
    mode: "mock",
    telegramId: parsed.telegramId,
    context: "mock",
    ...(parsed.startParam !== undefined
      ? { startParam: parsed.startParam }
      : {}),
    authDate: parsed.authDate,
    signing: "bot-token",
  };
}

/** Resolve and validate the saved Telegram bot/app tuple before authenticated MTProto acquisition. */
export function resolveTelegramTarget(project: Project): {
  bot: string;
  appShortName?: string;
  url: string;
  context: TelegramLaunchContext;
  startParam?: string;
} {
  const launch = project.launch;
  if (launch.kind !== "telegram")
    throw new LaunchValidationError("INVALID_DATA");
  if (
    !/^[A-Za-z][A-Za-z0-9_]{3,31}$/u.test(launch.bot) ||
    (launch.appShortName !== undefined &&
      !/^[A-Za-z0-9_-]{1,64}$/u.test(launch.appShortName))
  )
    throw new LaunchValidationError("INVALID_DATA");
  if (launch.context === "direct" && !launch.appShortName)
    throw new LaunchValidationError("INVALID_DATA");
  if (launch.context === "attachment" && launch.startParam !== undefined)
    throw new LaunchValidationError("INVALID_DATA");
  let url: URL;
  try {
    url = new URL(project.url);
  } catch {
    throw new LaunchValidationError("INVALID_DATA");
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    )
  )
    throw new LaunchValidationError("INVALID_DATA");
  if (url.username || url.password)
    throw new LaunchValidationError("INVALID_DATA");
  return {
    bot: launch.bot,
    ...(launch.appShortName ? { appShortName: launch.appShortName } : {}),
    url: url.toString(),
    context: launch.context,
    ...(launch.startParam !== undefined
      ? { startParam: launch.startParam }
      : {}),
  };
}

export function validateTelegramWebViewUrl(
  configuredUrl: string,
  returnedUrl: string,
): URL {
  let configured: URL;
  let returned: URL;
  try {
    configured = new URL(configuredUrl);
    returned = new URL(returnedUrl);
  } catch {
    throw new LaunchValidationError("INVALID_DATA");
  }
  const configuredQuery = [...configured.searchParams];
  const carriesConfiguredQuery = configuredQuery.every(([key, value]) => {
    const values = returned.searchParams.getAll(key);
    return (
      values.filter((candidate) => candidate === value).length ===
      configured.searchParams
        .getAll(key)
        .filter((candidate) => candidate === value).length
    );
  });
  if (
    returned.origin !== configured.origin ||
    returned.pathname !== configured.pathname ||
    returned.hash !== configured.hash ||
    returned.username ||
    returned.password ||
    !returned.searchParams.has("tgWebAppData") ||
    returned.searchParams.getAll("tgWebAppData").length !== 1 ||
    !carriesConfiguredQuery
  )
    throw new LaunchValidationError("INVALID_DATA");
  return returned;
}

export type PreparedTelegramLaunch = {
  mode: "telegram";
  url: string;
  verification: Extract<LaunchVerification, { mode: "telegram" }>;
  /** Keeps mtcute's webview lifetime request alive until the guest closes. */
  close(): Promise<void>;
};

/** Host-only Telegram acquisition, verification, and account-binding service. */
export class HostLaunchService {
  constructor(
    private readonly store: StudioStore,
    private readonly vault: SecretVault,
    private readonly accounts: AccountClientFactory,
    private readonly nowSeconds: () => number = () =>
      Math.floor(Date.now() / 1000),
    private readonly verificationOptions: Pick<
      Parameters<typeof verifyTelegramLaunch>[0],
      "environment" | "publicKeyHex" | "maxAgeSeconds"
    > = {},
  ) {}

  async prepareTelegram(
    projectId: string,
    platform: Platform,
  ): Promise<PreparedTelegramLaunch> {
    const project = this.store.getProject(projectId).project;
    const launch = project.launch;
    if (launch.kind !== "telegram")
      throw new LaunchValidationError("INVALID_DATA");
    const target = resolveTelegramTarget(project);
    const identity = this.store.getIdentity(project.identityId);
    if (identity.kind !== "telegram" || identity.status !== "ready")
      throw new LaunchValidationError("IDENTITY_MISMATCH");
    const session = await this.vault.get(identity.accountRef);
    if (!session) throw new LaunchValidationError("IDENTITY_MISMATCH");
    const client = this.accounts.create(session);
    try {
      const currentProfile = await client.getMe();
      if (currentProfile.telegramId !== identity.profile.telegramId)
        throw new LaunchValidationError("IDENTITY_MISMATCH");
      if (!client.openWebview) throw new LaunchValidationError("UNAVAILABLE");
      const opened = await client.openWebview({
        bot: target.bot,
        platform,
        launch,
      });
      const returnedUrl = validateTelegramWebViewUrl(target.url, opened.url);
      const initData = returnedUrl.searchParams.get("tgWebAppData");
      if (!initData) throw new LaunchValidationError("INVALID_DATA");
      const verification = verifyTelegramLaunch({
        initData,
        botId: opened.botId,
        identity,
        context: target.context,
        expectedContext: launch.context,
        expectedStartParam: target.startParam,
        nowSeconds: this.nowSeconds(),
        ...this.verificationOptions,
      });
      return {
        mode: "telegram",
        url: returnedUrl.toString(),
        verification,
        close: () => client.close(),
      };
    } catch (error) {
      await client.close().catch(() => {});
      if (error instanceof LaunchValidationError) throw error;
      throw new LaunchValidationError("UNAVAILABLE");
    }
  }
}

export const telegramLaunchPublicKeys = TELEGRAM_ED25519_KEYS;

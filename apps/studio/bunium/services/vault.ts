import { randomUUID } from "node:crypto";

const SERVICE = "com.tma-studio.credentials";
const REF_PREFIX = "vault:v1:";
const MAX_SECRET_BYTES = 4096;

export type SecurePlatform = "darwin" | "win32" | "linux";
export type VaultMode = "system" | "session-only";
export type SystemVaultBackend =
  | "macos-keychain"
  | "windows-credential-manager"
  | "linux-secret-service";
export type VaultFallbackReason =
  | "native-api-unavailable"
  | "system-store-unavailable"
  | "unsupported-platform";

export interface CredentialApi {
  get(options: { service: string; name: string }): Promise<string | null>;
  set(options: { service: string; name: string; value: string }): Promise<void>;
  delete(options: { service: string; name: string }): Promise<boolean>;
}

export interface VaultStatus {
  mode: VaultMode;
  backend: SystemVaultBackend | "memory";
  fallbackReason?: VaultFallbackReason;
}

export interface RendererVaultStatus {
  mode: VaultMode;
  backend: VaultStatus["backend"];
  fallbackReason?: VaultFallbackReason;
}

export interface SecretVault {
  readonly status: VaultStatus;
  set(secret: string): Promise<string>;
  /** Host-only stable reference used to make cross-store imports retryable. */
  setWithReference?(secret: string, reference: string): Promise<string>;
  get(reference: string): Promise<string | null>;
  delete(reference: string): Promise<boolean>;
  close(): void;
}

export class VaultUnavailableError extends Error {
  constructor() {
    super("The selected credential store is unavailable.");
    this.name = "VaultUnavailableError";
  }
}

export class SecretVaultInputError extends Error {
  constructor() {
    super("Credential input is invalid.");
    this.name = "SecretVaultInputError";
  }
}

function backendFor(platform: string): SystemVaultBackend | null {
  switch (platform) {
    case "darwin":
      return "macos-keychain";
    case "win32":
      return "windows-credential-manager";
    case "linux":
      return "linux-secret-service";
    default:
      return null;
  }
}

function validReference(reference: string): boolean {
  return /^vault:v1:[0-9a-f-]{36}$/u.test(reference);
}

function validateSecret(secret: string): void {
  if (
    typeof secret !== "string" ||
    secret.length === 0 ||
    new TextEncoder().encode(secret).length > MAX_SECRET_BYTES
  ) {
    throw new SecretVaultInputError();
  }
}

function createReference(): string {
  return `${REF_PREFIX}${randomUUID()}`;
}

class SystemSecretVault implements SecretVault {
  readonly status: VaultStatus;

  constructor(
    private readonly api: CredentialApi,
    backend: SystemVaultBackend,
  ) {
    this.status = { mode: "system", backend };
  }

  async set(secret: string): Promise<string> {
    return this.setWithReference(secret, createReference());
  }

  async setWithReference(secret: string, reference: string): Promise<string> {
    validateSecret(secret);
    this.validateReference(reference);
    try {
      await this.api.set({ service: SERVICE, name: reference, value: secret });
      return reference;
    } catch {
      throw new VaultUnavailableError();
    }
  }

  async get(reference: string): Promise<string | null> {
    this.validateReference(reference);
    try {
      return await this.api.get({ service: SERVICE, name: reference });
    } catch {
      throw new VaultUnavailableError();
    }
  }

  async delete(reference: string): Promise<boolean> {
    this.validateReference(reference);
    try {
      return await this.api.delete({ service: SERVICE, name: reference });
    } catch {
      throw new VaultUnavailableError();
    }
  }

  close(): void {}

  private validateReference(reference: string): void {
    if (!validReference(reference)) throw new SecretVaultInputError();
  }
}

class SessionSecretVault implements SecretVault {
  readonly status: VaultStatus;
  private readonly secrets = new Map<string, string>();

  constructor(reason: VaultFallbackReason) {
    this.status = {
      mode: "session-only",
      backend: "memory",
      fallbackReason: reason,
    };
  }

  async set(secret: string): Promise<string> {
    return this.setWithReference(secret, createReference());
  }

  async setWithReference(secret: string, reference: string): Promise<string> {
    validateSecret(secret);
    this.validateReference(reference);
    this.secrets.set(reference, secret);
    return reference;
  }

  async get(reference: string): Promise<string | null> {
    this.validateReference(reference);
    return this.secrets.get(reference) ?? null;
  }

  async delete(reference: string): Promise<boolean> {
    this.validateReference(reference);
    return this.secrets.delete(reference);
  }

  close(): void {
    this.secrets.clear();
  }

  private validateReference(reference: string): void {
    if (!validReference(reference)) throw new SecretVaultInputError();
  }
}

function systemApi(): CredentialApi | null {
  if (
    typeof Bun === "undefined" ||
    typeof Bun.secrets?.get !== "function" ||
    typeof Bun.secrets?.set !== "function" ||
    typeof Bun.secrets?.delete !== "function"
  ) {
    return null;
  }
  return {
    get: ({ service, name }) => Bun.secrets.get({ service, name }),
    set: ({ service, name, value }) =>
      Bun.secrets.set({ service, name, value, allowUnrestrictedAccess: false }),
    delete: ({ service, name }) => Bun.secrets.delete({ service, name }),
  };
}

async function qualify(api: CredentialApi): Promise<boolean> {
  const name = `probe:${randomUUID()}`;
  const value = randomUUID();
  let created = false;
  let roundTrip = false;
  try {
    await api.set({ service: SERVICE, name, value });
    created = true;
    roundTrip = (await api.get({ service: SERVICE, name })) === value;
  } catch {
    roundTrip = false;
  }
  if (!created) return false;
  try {
    const deleted = await api.delete({ service: SERVICE, name });
    return roundTrip && deleted;
  } catch {
    // The probe credential contains no user data and uses a one-off random key.
    return false;
  }
}

export async function createSecretVault(
  options: { platform?: string; api?: CredentialApi | null } = {},
): Promise<SecretVault> {
  const platform = options.platform ?? process.platform;
  const backend = backendFor(platform);
  if (!backend) return new SessionSecretVault("unsupported-platform");
  const api = options.api === undefined ? systemApi() : options.api;
  if (!api) return new SessionSecretVault("native-api-unavailable");
  if (!(await qualify(api))) {
    return new SessionSecretVault("system-store-unavailable");
  }
  return new SystemSecretVault(api, backend);
}

export function toRendererVaultStatus(
  status: VaultStatus,
): RendererVaultStatus {
  return {
    mode: status.mode,
    backend: status.backend,
    ...(status.fallbackReason ? { fallbackReason: status.fallbackReason } : {}),
  };
}

export function redactSensitiveText(
  text: string,
  knownSecrets: readonly string[] = [],
): string {
  let redacted = text;
  for (const secret of [...knownSecrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/gu, "[REDACTED_BOT_TOKEN]")
    .replace(
      /\b(tgWebAppData|initData|access_token|api_hash|hash|phone_number)=([^&\s]+)/giu,
      "$1=[REDACTED]",
    )
    .replace(/\+?\d[\d ().-]{5,}\d/gu, "[REDACTED_PHONE]");
}

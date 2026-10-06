export interface BiometryInfo {
  available: boolean;
  type: "finger" | "face" | "unknown";
  deviceId: string;
  accessRequested: boolean;
  accessGranted: boolean;
}
export interface BiometryEffect {
  info(): Promise<BiometryInfo | null>;
  requestAccess(reason?: string): Promise<boolean>;
  authenticate(reason?: string): Promise<boolean>;
  openSettings(): Promise<boolean>;
}
export interface BiometryTokenVault {
  put(
    scope: string,
    token: string,
    navigationGeneration: number,
  ): Promise<void>;
  get(scope: string, navigationGeneration: number): Promise<string | null>;
  delete(scope: string, navigationGeneration: number): Promise<void>;
}
export interface BiometryResult {
  status: "applied" | "denied" | "unsupported" | "invalid" | "stale";
  replies: Array<{ eventType: string; eventData: unknown }>;
}

/** Biometry effects and the token vault are injected; the token stays host-side except the SDK auth reply. */
export class BiometryProtocolService {
  private infoState: BiometryInfo | null = null;
  private tokenSaved = false;
  constructor(
    private readonly scope: string,
    private generation: number,
    private readonly clientVersion: string | undefined,
    private readonly mode: "mock" | "real",
    private readonly effect: BiometryEffect = unsupportedEffect,
    private readonly vault?: BiometryTokenVault,
  ) {
    if (!scope) throw new TypeError("Biometry scope is required.");
  }

  async handle(
    eventType: string,
    value: unknown = "",
    generation = this.generation,
  ): Promise<BiometryResult> {
    if (generation !== this.generation) return result("stale");
    const requestGeneration = this.generation;
    if (!versionAtLeast(this.clientVersion, "7.2"))
      return result("unsupported", infoReply(unavailableInfo));
    try {
      switch (eventType) {
        case "web_app_biometry_get_info":
          if (value !== "") return result("invalid");
          return this.refreshInfo(requestGeneration);
        case "web_app_biometry_request_access": {
          const request = readReason(value);
          if (request === null) return result("invalid");
          if (this.mode === "mock")
            return result("denied", infoReply(unavailableInfo));
          const allowed = await this.effect.requestAccess(request.reason);
          if (requestGeneration !== this.generation) return result("stale");
          const current = await this.readInfo();
          if (requestGeneration !== this.generation) return result("stale");
          this.infoState = {
            ...current,
            accessRequested: true,
            accessGranted: allowed,
          };
          return result(
            allowed ? "applied" : "denied",
            await this.infoReply(this.infoState),
          );
        }
        case "web_app_biometry_request_auth": {
          const request = readReason(value);
          if (request === null) return result("invalid");
          if (
            this.mode === "mock" ||
            !this.infoState?.available ||
            !this.infoState.accessGranted
          )
            return result("denied", [
              {
                eventType: "biometry_auth_requested",
                eventData: { status: "failed" },
              },
              ...infoReply(this.infoState ?? unavailableInfo),
            ]);
          const authorized = await this.effect.authenticate(request.reason);
          if (requestGeneration !== this.generation) return result("stale");
          const token = authorized
            ? await this.vault?.get(this.scope, requestGeneration)
            : null;
          if (requestGeneration !== this.generation) return result("stale");
          if (authorized && token)
            return result("applied", [
              {
                eventType: "biometry_auth_requested",
                eventData: { status: "authorized", token },
              },
              ...infoReply(this.infoState),
            ]);
          return result("denied", [
            {
              eventType: "biometry_auth_requested",
              eventData: { status: "failed" },
            },
            ...infoReply(this.infoState),
          ]);
        }
        case "web_app_biometry_update_token": {
          const token = readToken(value);
          if (token === null) return result("invalid");
          if (
            this.mode === "mock" ||
            !this.infoState?.available ||
            !this.infoState.accessGranted ||
            !this.vault
          )
            return result(
              "denied",
              tokenReply(
                false,
                token.length === 0,
                this.infoState ?? unavailableInfo,
                this.tokenSaved,
              ),
            );
          if (token.length === 0) {
            await this.vault.delete(this.scope, requestGeneration);
            this.tokenSaved = false;
          } else {
            await this.vault.put(this.scope, token, requestGeneration);
            this.tokenSaved = true;
          }
          if (requestGeneration !== this.generation) return result("stale");
          return result(
            "applied",
            tokenReply(
              true,
              token.length === 0,
              this.infoState ?? unavailableInfo,
              this.tokenSaved,
            ),
          );
        }
        case "web_app_biometry_open_settings": {
          if (value !== "") return result("invalid");
          if (
            this.mode === "mock" ||
            !this.infoState?.available ||
            !this.infoState.accessRequested
          )
            return result(
              "denied",
              infoReply(this.infoState ?? unavailableInfo),
            );
          const opened = await this.effect.openSettings();
          if (requestGeneration !== this.generation) return result("stale");
          const updated = await this.readInfo();
          if (requestGeneration !== this.generation) return result("stale");
          this.infoState = updated;
          this.tokenSaved = Boolean(
            updated.accessGranted &&
              (await this.vault?.get(this.scope, requestGeneration)),
          );
          if (requestGeneration !== this.generation) return result("stale");
          return result(
            opened ? "applied" : "unsupported",
            await this.infoReply(updated),
          );
        }
        default:
          return result("unsupported");
      }
    } catch {
      if (requestGeneration !== this.generation) return result("stale");
      return result(
        "denied",
        eventType === "web_app_biometry_request_auth"
          ? [
              {
                eventType: "biometry_auth_requested",
                eventData: { status: "failed" },
              },
              ...infoReply(this.infoState ?? unavailableInfo),
            ]
          : eventType === "web_app_biometry_update_token"
            ? tokenReply(
                false,
                false,
                this.infoState ?? unavailableInfo,
                this.tokenSaved,
              )
            : infoReply(unavailableInfo),
      );
    }
  }

  private async refreshInfo(generation: number): Promise<BiometryResult> {
    const info = this.mode === "mock" ? unavailableInfo : await this.readInfo();
    if (generation !== this.generation) return result("stale");
    this.infoState = info;
    this.tokenSaved = Boolean(
      info.available &&
        info.accessGranted &&
        (await this.vault?.get(this.scope, generation)),
    );
    if (generation !== this.generation) return result("stale");
    return result(
      this.mode === "mock" || !info.available ? "unsupported" : "applied",
      infoReply(info, this.tokenSaved),
    );
  }

  private async readInfo(): Promise<BiometryInfo> {
    const info = await this.effect.info();
    return info ? sanitizeInfo(info) : unavailableInfo;
  }

  private async infoReply(
    info = this.infoState ?? unavailableInfo,
  ): Promise<Array<{ eventType: string; eventData: unknown }>> {
    return infoReply(info, this.tokenSaved);
  }

  navigate(nextGeneration: number): BiometryResult {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return result("invalid");
    this.generation = nextGeneration;
    this.infoState = null;
    this.tokenSaved = false;
    return result("applied");
  }
}

const unavailableInfo: BiometryInfo = {
  available: false,
  type: "unknown",
  deviceId: "",
  accessRequested: false,
  accessGranted: false,
};
const unsupportedEffect: BiometryEffect = {
  info: async () => null,
  requestAccess: async () => false,
  authenticate: async () => false,
  openSettings: async () => false,
};
function infoReply(info: BiometryInfo, tokenSaved = false) {
  return [
    {
      eventType: "biometry_info_received",
      eventData: {
        available: info.available,
        type: info.type,
        device_id: info.deviceId,
        access_requested: info.accessRequested,
        access_granted: info.accessGranted,
        token_saved: tokenSaved,
      },
    },
  ];
}
function tokenReply(
  ok: boolean,
  removed: boolean,
  info: BiometryInfo,
  tokenSaved: boolean,
) {
  return [
    {
      eventType: "biometry_token_updated",
      eventData: { status: ok ? (removed ? "removed" : "updated") : "failed" },
    },
    ...infoReply(info, tokenSaved),
  ];
}
function result(
  status: BiometryResult["status"],
  replies: BiometryResult["replies"] = [],
): BiometryResult {
  return { status, replies };
}
function readReason(value: unknown): { reason?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => key !== "reason") ||
    (data.reason !== undefined &&
      (typeof data.reason !== "string" || data.reason.length > 128))
  )
    return null;
  return typeof data.reason === "string" ? { reason: data.reason } : {};
}
function readToken(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== 1 ||
    typeof data.token !== "string" ||
    data.token.length > 1024
  )
    return null;
  return data.token;
}
function sanitizeInfo(info: BiometryInfo): BiometryInfo {
  if (
    typeof info.available !== "boolean" ||
    typeof info.accessRequested !== "boolean" ||
    typeof info.accessGranted !== "boolean" ||
    !["finger", "face", "unknown"].includes(info.type) ||
    typeof info.deviceId !== "string" ||
    info.deviceId.length > 128
  )
    return unavailableInfo;
  return { ...info, accessGranted: info.accessRequested && info.accessGranted };
}
function versionAtLeast(current: string | undefined, minimum: string): boolean {
  if (!current || !/^\d+(?:\.\d+)*$/u.test(current)) return false;
  const left = current.split(".").map(Number);
  const right = minimum.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const d = (left[i] ?? 0) - (right[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

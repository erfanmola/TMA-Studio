import {
  type ActionResult,
  action,
  checkAction,
  exactRecord,
  isTelegramHostname,
  safeHttpUrl,
  versionAtLeast,
} from "./action-utils";
import type { ProtocolEvent } from "./transport";

const TRY_BROWSER = new Set([
  "google-chrome",
  "chrome",
  "mozilla-firefox",
  "firefox",
  "microsoft-edge",
  "edge",
  "opera",
  "opera-mini",
  "brave",
  "brave-browser",
  "duckduckgo",
  "duckduckgo-browser",
  "samsung",
  "samsung-browser",
  "vivaldi",
  "kiwi",
  "uc",
  "tor",
  "tor-browser",
]);

export interface UserGestureGate {
  consumeRecentGesture(maxAgeMs: number): boolean;
}
export interface LinkEffects {
  openExternal(
    url: string,
    options: { tryInstantView: boolean; tryBrowser?: string },
  ): Promise<"opened" | "cancelled" | "unsupported">;
  openTelegramPath(
    pathFull: string,
    forceRequest: boolean,
  ): Promise<"opened" | "cancelled" | "unsupported">;
}

/** No guest supplied URL reaches a shell opener without validation and a recent trusted gesture. */
export class LinkProtocolService {
  constructor(
    private readonly mode: "mock" | "real",
    private navigationGeneration: number,
    private readonly clientVersion: string | undefined,
    private readonly gesture?: UserGestureGate,
    private readonly effects?: LinkEffects,
  ) {}

  async handle(event: ProtocolEvent): Promise<ActionResult> {
    const checked = checkAction(
      event,
      this.navigationGeneration,
      this.clientVersion,
      "04g",
      "outgoing",
    );
    if (checked) return checked;
    if (event.eventType === "web_app_open_link")
      return this.openLink(event.eventData);
    if (event.eventType === "web_app_open_tg_link")
      return this.openTelegramLink(event.eventData);
    return action("unsupported");
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.navigationGeneration
    )
      return false;
    this.navigationGeneration = nextGeneration;
    return true;
  }

  private async openLink(input: unknown): Promise<ActionResult> {
    if (
      !exactRecord(input, ["url"]) &&
      !exactRecord(input, ["url", "try_instant_view"]) &&
      !exactRecord(input, ["url", "try_browser"]) &&
      !exactRecord(input, ["url", "try_instant_view", "try_browser"])
    )
      return action("invalid");
    const data = input as Record<string, unknown>;
    const url = safeHttpUrl(data.url);
    if (
      !url ||
      (data.try_instant_view !== undefined &&
        typeof data.try_instant_view !== "boolean") ||
      (data.try_browser !== undefined &&
        (typeof data.try_browser !== "string" ||
          !TRY_BROWSER.has(data.try_browser) ||
          !versionAtLeast(this.clientVersion, "7.6")))
    )
      return action("invalid");
    if (this.mode === "mock" || !this.effects || !this.gesture)
      return action("unsupported");
    if (!this.gesture.consumeRecentGesture(1000)) return action("denied");
    const requestGeneration = this.navigationGeneration;
    try {
      const outcome = await this.effects.openExternal(url.href, {
        tryInstantView: data.try_instant_view === true,
        ...(typeof data.try_browser === "string"
          ? { tryBrowser: data.try_browser }
          : {}),
      });
      if (requestGeneration !== this.navigationGeneration)
        return action("stale");
      return action(
        outcome === "opened"
          ? "applied"
          : outcome === "cancelled"
            ? "denied"
            : "unsupported",
      );
    } catch {
      return requestGeneration === this.navigationGeneration
        ? action("denied")
        : action("stale");
    }
  }

  private async openTelegramLink(input: unknown): Promise<ActionResult> {
    if (
      !exactRecord(input, ["path_full"]) &&
      !exactRecord(input, ["path_full", "force_request"])
    )
      return action("invalid");
    const data = input as Record<string, unknown>;
    if (
      typeof data.path_full !== "string" ||
      data.path_full.length === 0 ||
      data.path_full.length > 2048 ||
      !data.path_full.startsWith("/") ||
      data.path_full.startsWith("//") ||
      data.path_full.includes("\\") ||
      [...data.path_full].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 0x1f || code === 0x7f;
      }) ||
      (data.force_request !== undefined &&
        typeof data.force_request !== "boolean")
    )
      return action("invalid");
    let target: URL;
    try {
      target = new URL(data.path_full, "https://t.me");
    } catch {
      return action("invalid");
    }
    if (
      !isTelegramHostname(target.hostname) ||
      target.username !== "" ||
      target.password !== "" ||
      target.port !== ""
    )
      return action("invalid");
    if (this.mode === "mock" || !this.effects || !this.gesture)
      return action("unsupported");
    if (!this.gesture.consumeRecentGesture(1000)) return action("denied");
    const requestGeneration = this.navigationGeneration;
    try {
      const outcome = await this.effects.openTelegramPath(
        `${target.pathname}${target.search}`,
        data.force_request === true,
      );
      if (requestGeneration !== this.navigationGeneration)
        return action("stale");
      return action(
        outcome === "opened"
          ? "applied"
          : outcome === "cancelled"
            ? "denied"
            : "unsupported",
      );
    } catch {
      return requestGeneration === this.navigationGeneration
        ? action("denied")
        : action("stale");
    }
  }
}

import { type ActionResult, action, checkAction } from "./action-utils";
import type { ProtocolEvent } from "./transport";

export interface HomeScreenEffects {
  add(signal: AbortSignal): Promise<"added" | "cancelled" | "unsupported">;
  status(): Promise<"added" | "missed" | "unknown" | "unsupported">;
}
export interface HomeScreenGestureGate {
  consumeRecentGesture(maxAgeMs: number): boolean;
}

/** Home-screen prompts and answers are explicit; no shortcut is claimed by simulation. */
export class HomeScreenProtocolService {
  private generation: number;
  private addController?: AbortController;

  constructor(
    private readonly mode: "mock" | "real",
    generation: number,
    private readonly clientVersion: string | undefined,
    private readonly gesture?: HomeScreenGestureGate,
    private readonly effects?: HomeScreenEffects,
  ) {
    this.generation = generation;
  }

  async handle(event: ProtocolEvent): Promise<ActionResult> {
    const checked = checkAction(
      event,
      this.generation,
      this.clientVersion,
      "04h",
      "outgoing",
    );
    if (checked) return checked;
    if (!isEmptyPayload(event.eventData)) return action("invalid");
    if (event.eventType === "web_app_add_to_home_screen") return this.add();
    if (event.eventType === "web_app_check_home_screen") return this.check();
    return action("unsupported");
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return false;
    this.generation = nextGeneration;
    this.addController?.abort();
    this.addController = undefined;
    return true;
  }

  private async add(): Promise<ActionResult> {
    if (this.addController) return action("denied");
    if (this.mode !== "real" || !this.effects) return unsupportedAdd();
    if (!this.gesture?.consumeRecentGesture(10_000)) return action("denied");
    const generation = this.generation;
    const controller = new AbortController();
    this.addController = controller;
    try {
      const outcome = await this.effects.add(controller.signal);
      if (controller.signal.aborted) return action("stale");
      if (generation !== this.generation) return action("stale");
      if (outcome === "added")
        return action("applied", [
          { eventType: "home_screen_added", eventData: null },
        ]);
      return outcome === "unsupported" ? unsupportedAdd() : action("denied");
    } catch {
      return generation === this.generation && !controller.signal.aborted
        ? unsupportedAdd()
        : action("stale");
    } finally {
      if (this.addController === controller) this.addController = undefined;
    }
  }

  private async check(): Promise<ActionResult> {
    if (this.mode !== "real" || !this.effects)
      return homeStatus("unsupported", "unsupported");
    const generation = this.generation;
    try {
      const status = await this.effects.status();
      if (generation !== this.generation) return action("stale");
      if (!["added", "missed", "unknown", "unsupported"].includes(status))
        return homeStatus("unsupported", "denied");
      return homeStatus(
        status,
        status === "unsupported" ? "unsupported" : "applied",
      );
    } catch {
      return generation === this.generation
        ? homeStatus("unsupported", "denied")
        : action("stale");
    }
  }
}

function unsupportedAdd(): ActionResult {
  return action("unsupported", [
    { eventType: "home_screen_failed", eventData: { error: "UNSUPPORTED" } },
  ]);
}
function homeStatus(
  status: "added" | "missed" | "unknown" | "unsupported",
  actionStatus: "applied" | "denied" | "unsupported",
): ActionResult {
  return action(actionStatus, [
    { eventType: "home_screen_checked", eventData: { status } },
  ]);
}
function isEmptyPayload(value: unknown): boolean {
  return value === null || value === "";
}

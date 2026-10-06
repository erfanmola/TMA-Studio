import {
  type ActionResult,
  action,
  checkAction,
  exactRecord,
} from "./action-utils";
import type { ProtocolEvent } from "./transport";

export interface ShareEffects {
  sendPreparedMessage(
    id: string,
  ): Promise<"sent" | "declined" | "failed" | "unsupported">;
  sendDataAndClose(data: string): Promise<"sent" | "unsupported">;
}

/** Sharing effects require a real provider; local simulation never reports a sent message. */
export class SharingProtocolService {
  private activePreparedId: string | null = null;

  constructor(
    private readonly mode: "mock" | "real",
    private generation: number,
    private readonly clientVersion: string | undefined,
    private readonly keyboardButtonContext: boolean | null,
    private readonly effects?: ShareEffects,
  ) {}

  async handle(event: ProtocolEvent): Promise<ActionResult> {
    const direction =
      event.eventType === "prepared_message_sent" ||
      event.eventType === "prepared_message_failed"
        ? "incoming"
        : "outgoing";
    const checked = checkAction(
      event,
      this.generation,
      this.clientVersion,
      "04g",
      direction,
    );
    if (checked) return checked;
    if (event.eventType === "web_app_send_prepared_message")
      return this.sendPrepared(event.eventData);
    if (event.eventType === "prepared_message_sent")
      return this.receivePreparedSent(event.eventData);
    if (event.eventType === "prepared_message_failed")
      return this.receivePreparedFailed(event.eventData);
    if (event.eventType === "web_app_data_send")
      return this.sendData(event.eventData);
    return action("unsupported");
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return false;
    this.generation = nextGeneration;
    this.activePreparedId = null;
    return true;
  }

  private async sendPrepared(input: unknown): Promise<ActionResult> {
    if (
      !exactRecord(input, ["id"]) ||
      typeof input.id !== "string" ||
      input.id.trim().length === 0 ||
      input.id.length > 256 ||
      [...input.id].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code <= 0x1f || code === 0x7f;
      })
    )
      return action("invalid");
    if (this.activePreparedId !== null) return action("denied");
    if (this.mode !== "real" || !this.effects)
      return action("unsupported", [
        {
          eventType: "prepared_message_failed",
          eventData: { error: "UNSUPPORTED" },
        },
      ]);
    const generation = this.generation;
    this.activePreparedId = input.id;
    try {
      const result = await this.effects.sendPreparedMessage(input.id);
      if (generation !== this.generation || this.activePreparedId !== input.id)
        return action("stale");
      if (result === "sent")
        return action("applied", [
          { eventType: "prepared_message_sent", eventData: null },
        ]);
      return action(
        result === "declined"
          ? "denied"
          : result === "failed"
            ? "denied"
            : "unsupported",
        [
          {
            eventType: "prepared_message_failed",
            eventData: {
              error:
                result === "declined"
                  ? "USER_DECLINED"
                  : result === "failed"
                    ? "MESSAGE_SEND_FAILED"
                    : "UNSUPPORTED",
            },
          },
        ],
      );
    } catch {
      if (generation !== this.generation || this.activePreparedId !== input.id)
        return action("stale");
      return action("denied", [
        {
          eventType: "prepared_message_failed",
          eventData: { error: "MESSAGE_SEND_FAILED" },
        },
      ]);
    } finally {
      if (this.activePreparedId === input.id) this.activePreparedId = null;
    }
  }

  private receivePreparedSent(input: unknown): ActionResult {
    if (input !== null) return action("invalid");
    if (this.activePreparedId === null) return action("stale");
    this.activePreparedId = null;
    return action("applied");
  }

  private receivePreparedFailed(input: unknown): ActionResult {
    if (
      !exactRecord(input, ["error"]) ||
      typeof input.error !== "string" ||
      input.error.length === 0 ||
      input.error.length > 512
    )
      return action("invalid");
    if (this.activePreparedId === null) return action("stale");
    this.activePreparedId = null;
    return action("denied");
  }

  private async sendData(input: unknown): Promise<ActionResult> {
    if (!exactRecord(input, ["data"]) || typeof input.data !== "string")
      return action("invalid");
    const size = new TextEncoder().encode(input.data).byteLength;
    if (size === 0 || size > 4096) return action("invalid");
    if (
      this.keyboardButtonContext !== true ||
      this.mode !== "real" ||
      !this.effects
    )
      return action("unsupported");
    const generation = this.generation;
    try {
      const result = await this.effects.sendDataAndClose(input.data);
      if (generation !== this.generation) return action("stale");
      return result === "sent" ? action("applied") : action("unsupported");
    } catch {
      return generation === this.generation
        ? action("denied")
        : action("stale");
    }
  }
}

export interface PopupButton {
  id: string;
  type: "default" | "destructive" | "ok" | "close" | "cancel";
  text?: string;
}
export interface PopupRequest {
  title?: string;
  message: string;
  buttons: PopupButton[];
}
export interface PopupFlow {
  generation: number;
  request: PopupRequest;
}
export type FlowReply = { eventType: string; eventData: unknown };
export type FlowResult =
  | { status: "started"; replies: [] }
  | { status: "completed"; replies: FlowReply[] }
  | { status: "cancelled"; replies: FlowReply[] }
  | { status: "denied"; reason: string; replies: FlowReply[] }
  | { status: "invalid"; reason: string; replies: [] }
  | { status: "busy"; replies: [] }
  | { status: "stale"; replies: [] };

export interface PopupEffect {
  present(request: PopupRequest): "presented" | "denied" | "unsupported";
  close(): void;
}

/** UI-neutral popup contract; rendering is supplied later by a profile adapter. */
export class PopupProtocolService {
  constructor(
    private readonly flows: DialogFlowManager,
    private readonly effect: PopupEffect = {
      present: () => "unsupported",
      close: () => undefined,
    },
  ) {}

  open(value: unknown, generation: number): FlowResult {
    const result = this.flows.openPopup(value, generation);
    if (result.status !== "started") return result;
    const request = this.flows.popupRequest;
    if (!request)
      return {
        status: "invalid",
        reason: "Popup state was not created.",
        replies: [],
      };
    const outcome = this.effect.present(request);
    if (outcome === "presented") return result;
    this.flows.cancel(generation);
    return {
      status: "denied",
      reason:
        outcome === "denied"
          ? "Popup effect was denied."
          : "Popup capability is unverified.",
      replies: [{ eventType: "popup_closed", eventData: {} }],
    };
  }

  select(buttonId: string, generation: number): FlowResult {
    const result = this.flows.selectPopupButton(buttonId, generation);
    if (result.status === "completed") this.effect.close();
    return result;
  }

  cancel(generation: number): FlowResult {
    const hadPopup = this.flows.active === "popup";
    const result = this.flows.cancel(generation);
    if (hadPopup && result.status === "cancelled") this.effect.close();
    return result;
  }

  navigate(nextGeneration: number): FlowResult {
    const hadPopup = this.flows.active === "popup";
    const result = this.flows.navigate(nextGeneration);
    if (hadPopup && result.status === "cancelled") this.effect.close();
    return result;
  }
}

export class DialogFlowManager {
  private popup: PopupFlow | null = null;
  private scannerGeneration: number | null = null;

  constructor(private generation: number) {
    if (!Number.isSafeInteger(generation) || generation < 0)
      throw new TypeError("Invalid navigation generation.");
  }

  get active(): "popup" | "scanner" | null {
    return this.popup
      ? "popup"
      : this.scannerGeneration === null
        ? null
        : "scanner";
  }

  get popupRequest(): PopupRequest | null {
    return this.popup?.request ?? null;
  }

  openPopup(value: unknown, generation = this.generation): FlowResult {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    if (this.active) return { status: "busy", replies: [] };
    try {
      this.popup = { generation, request: validatePopup(value) };
      return { status: "started", replies: [] };
    } catch (error) {
      return invalid(error);
    }
  }

  openScanner(value: unknown, generation = this.generation): FlowResult {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    if (this.active) return { status: "busy", replies: [] };
    try {
      validateScanner(value);
      this.scannerGeneration = generation;
      return { status: "started", replies: [] };
    } catch (error) {
      return invalid(error);
    }
  }

  selectPopupButton(
    buttonId: string,
    generation = this.generation,
  ): FlowResult {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    if (!this.popup) return { status: "cancelled", replies: [] };
    if (!this.popup.request.buttons.some((button) => button.id === buttonId))
      return {
        status: "invalid",
        reason: "Unknown popup button ID.",
        replies: [],
      };
    this.popup = null;
    return {
      status: "completed",
      replies: [
        { eventType: "popup_closed", eventData: { button_id: buttonId } },
      ],
    };
  }

  cancel(generation = this.generation): FlowResult {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    if (this.popup) {
      this.popup = null;
      return {
        status: "cancelled",
        replies: [{ eventType: "popup_closed", eventData: {} }],
      };
    }
    if (this.scannerGeneration !== null) {
      this.scannerGeneration = null;
      return {
        status: "cancelled",
        replies: [{ eventType: "scan_qr_popup_closed", eventData: null }],
      };
    }
    return { status: "cancelled", replies: [] };
  }

  closeScanner(generation = this.generation): FlowResult {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    if (this.scannerGeneration === null)
      return { status: "cancelled", replies: [] };
    this.scannerGeneration = null;
    return { status: "completed", replies: [] };
  }

  acceptScanText(text: string, generation = this.generation): FlowResult {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    if (this.scannerGeneration === null)
      return { status: "cancelled", replies: [] };
    if (typeof text !== "string" || text.length > 4096)
      return {
        status: "invalid",
        reason: "Invalid scanner text.",
        replies: [],
      };
    return {
      status: "completed",
      replies: [{ eventType: "qr_text_received", eventData: { data: text } }],
    };
  }

  navigate(nextGeneration: number): FlowResult {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return {
        status: "invalid",
        reason: "Navigation generation must increase.",
        replies: [],
      };
    this.popup = null;
    this.scannerGeneration = null;
    this.generation = nextGeneration;
    return { status: "cancelled", replies: [] };
  }
}

export function validatePopup(value: unknown): PopupRequest {
  const data = object(value, ["title", "message", "buttons"]);
  if (
    typeof data.message !== "string" ||
    data.message.trim().length === 0 ||
    data.message.trim().length > 256
  )
    throw new TypeError("Popup message must contain 1–256 characters.");
  if (
    data.title !== undefined &&
    (typeof data.title !== "string" || data.title.trim().length > 64)
  )
    throw new TypeError("Popup title must be at most 64 characters.");
  const rawButtons = data.buttons ?? [{ id: "", type: "close" }];
  if (
    !Array.isArray(rawButtons) ||
    rawButtons.length < 1 ||
    rawButtons.length > 3
  )
    throw new TypeError("Popup must contain one to three buttons.");
  const buttons = rawButtons.map((raw) => {
    const button = object(raw, ["id", "type", "text"]);
    const id = button.id === undefined ? "" : String(button.id);
    const type = button.type ?? "default";
    if (
      id.length > 64 ||
      !["default", "destructive", "ok", "close", "cancel"].includes(
        String(type),
      )
    )
      throw new TypeError("Popup button ID or type is invalid.");
    const needsText = type === "default" || type === "destructive";
    if (
      needsText &&
      (typeof button.text !== "string" ||
        button.text.trim().length === 0 ||
        button.text.trim().length > 64)
    )
      throw new TypeError("Popup action buttons need 1–64 characters of text.");
    if (!needsText && button.text !== undefined)
      throw new TypeError("This popup button type does not accept text.");
    return {
      id,
      type: type as PopupButton["type"],
      ...(needsText ? { text: (button.text as string).trim() } : {}),
    };
  });
  if (new Set(buttons.map((button) => button.id)).size !== buttons.length)
    throw new TypeError("Popup button IDs must be unique.");
  return {
    ...(typeof data.title === "string" && data.title.trim()
      ? { title: data.title.trim() }
      : {}),
    message: data.message.trim(),
    buttons,
  };
}

export function validateScanner(value: unknown): { text?: string } {
  const data = object(value, ["text"]);
  if (
    data.text !== undefined &&
    (typeof data.text !== "string" || data.text.trim().length > 64)
  )
    throw new TypeError("Scanner instruction must be at most 64 characters.");
  return typeof data.text === "string" && data.text.trim()
    ? { text: data.text.trim() }
    : {};
}

function object(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected a protocol object.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key)))
    throw new TypeError("Unexpected protocol field.");
  return record;
}
function invalid(error: unknown): FlowResult {
  return {
    status: "invalid",
    reason:
      error instanceof Error ? error.message : "Invalid protocol payload.",
    replies: [],
  };
}

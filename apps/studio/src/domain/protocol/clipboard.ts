export interface ClipboardReadEffect {
  read(requestId: string): "pending" | "denied" | "unsupported";
  cancel(requestId: string): void;
}

export interface ClipboardPending {
  requestId: string;
  generation: number;
}

/** Host-only clipboard request correlation. Default effect denies without touching OS APIs. */
export class ClipboardProtocolService {
  private pending = new Map<string, ClipboardPending>();

  constructor(
    private generation: number,
    private readonly effect: ClipboardReadEffect = {
      read: () => "unsupported",
      cancel: () => undefined,
    },
  ) {}

  get pendingCount(): number {
    return this.pending.size;
  }

  request(
    value: unknown,
    generation = this.generation,
  ):
    | { status: "pending"; replies: [] }
    | {
        status: "denied";
        replies: Array<{ eventType: string; eventData: unknown }>;
      }
    | { status: "invalid" | "stale" | "busy"; replies: [] } {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    const requestId = readRequestId(value);
    if (!requestId) return { status: "invalid", replies: [] };
    if (this.pending.has(requestId)) return { status: "busy", replies: [] };
    if (this.pending.size >= 8) return { status: "busy", replies: [] };
    const outcome = this.effect.read(requestId);
    if (outcome === "denied" || outcome === "unsupported") {
      return {
        status: "denied",
        replies: [
          {
            eventType: "clipboard_text_received",
            eventData: { req_id: requestId, data: null },
          },
        ],
      };
    }
    this.pending.set(requestId, { requestId, generation });
    return { status: "pending", replies: [] };
  }

  resolve(
    requestId: string,
    value: string | null,
    generation = this.generation,
  ):
    | {
        status: "completed" | "denied";
        replies: Array<{ eventType: string; eventData: unknown }>;
      }
    | { status: "stale" | "invalid"; replies: [] } {
    if (generation !== this.generation) return { status: "stale", replies: [] };
    const item = this.pending.get(requestId);
    if (!item || item.generation !== generation)
      return { status: "invalid", replies: [] };
    if (value !== null && (typeof value !== "string" || value.length > 4096))
      value = null;
    this.pending.delete(requestId);
    return {
      status: value === null ? "denied" : "completed",
      replies: [
        {
          eventType: "clipboard_text_received",
          eventData: { req_id: requestId, data: value },
        },
      ],
    };
  }

  navigate(nextGeneration: number): { cancelledRequestIds: string[] } {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      throw new TypeError("Navigation generation must increase.");
    const cancelledRequestIds = [...this.pending.keys()];
    for (const requestId of cancelledRequestIds) this.effect.cancel(requestId);
    this.pending.clear();
    this.generation = nextGeneration;
    return { cancelledRequestIds };
  }
}

function readRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== 1 ||
    typeof data.req_id !== "string" ||
    !/^[A-Za-z0-9]{16}$/u.test(data.req_id)
  )
    return null;
  return data.req_id;
}

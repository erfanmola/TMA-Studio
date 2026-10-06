import type { DialogFlowManager, FlowResult } from "./dialogs";

export interface ScannerEffect {
  open(instructions?: string): "opened" | "denied" | "unsupported";
  close(): void;
}

/** Profile-neutral scanner adapter. No camera API is called by the domain layer. */
export class QrProtocolService {
  constructor(
    private readonly flows: DialogFlowManager,
    private readonly effect: ScannerEffect = {
      open: () => "unsupported",
      close: () => undefined,
    },
  ) {}

  open(value: unknown, generation: number): FlowResult {
    const result = this.flows.openScanner(value, generation);
    if (result.status !== "started") return result;
    const instruction =
      value && typeof value === "object"
        ? (value as { text?: unknown }).text
        : undefined;
    const outcome = this.effect.open(
      typeof instruction === "string" ? instruction : undefined,
    );
    if (outcome === "opened") return result;
    this.flows.closeScanner(generation);
    return outcome === "denied"
      ? {
          status: "denied",
          reason: "Scanner permission was denied.",
          replies: [{ eventType: "scan_qr_popup_closed", eventData: null }],
        }
      : {
          status: "denied",
          reason: "Scanner capability is unverified.",
          replies: [{ eventType: "scan_qr_popup_closed", eventData: null }],
        };
  }

  close(generation: number): FlowResult {
    const result = this.flows.closeScanner(generation);
    if (result.status === "completed") this.effect.close();
    return result;
  }

  cancel(generation: number): FlowResult {
    const hadScanner = this.flows.active === "scanner";
    const result = this.flows.cancel(generation);
    if (hadScanner && result.status === "cancelled") this.effect.close();
    return result;
  }

  navigate(nextGeneration: number): FlowResult {
    const hadScanner = this.flows.active === "scanner";
    const result = this.flows.navigate(nextGeneration);
    if (hadScanner && result.status === "cancelled") this.effect.close();
    return result;
  }

  scanned(text: string, generation: number): FlowResult {
    return this.flows.acceptScanText(text, generation);
  }
}

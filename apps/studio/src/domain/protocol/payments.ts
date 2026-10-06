import {
  type ActionResult,
  action,
  checkAction,
  exactRecord,
} from "./action-utils";
import type { ProtocolEvent } from "./transport";

export type InvoiceOutcome = "paid" | "pending" | "failed" | "cancelled";
export interface InvoiceEffects {
  openInvoice(slug: string): Promise<InvoiceOutcome>;
}

/** A paid result is forwarded only when an injected provider returns it for this request. */
export class PaymentProtocolService {
  private activeSlug: string | null = null;

  constructor(
    private readonly mode: "mock" | "real",
    private generation: number,
    private readonly clientVersion: string | undefined,
    private readonly effects?: InvoiceEffects,
  ) {}

  async handle(event: ProtocolEvent): Promise<ActionResult> {
    const direction =
      event.eventType === "invoice_closed" ? "incoming" : "outgoing";
    const checked = checkAction(
      event,
      this.generation,
      this.clientVersion,
      "04g",
      direction,
    );
    if (checked) return checked;
    if (event.eventType === "web_app_open_invoice")
      return this.openInvoice(event.eventData);
    if (event.eventType === "invoice_closed")
      return this.receiveClosed(event.eventData);
    return action("unsupported");
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return false;
    this.generation = nextGeneration;
    this.activeSlug = null;
    return true;
  }

  private async openInvoice(input: unknown): Promise<ActionResult> {
    if (!exactRecord(input, ["slug"]) || typeof input.slug !== "string")
      return action("invalid");
    const slug = input.slug;
    if (
      slug.length === 0 ||
      slug.length > 256 ||
      !/^[A-Za-z0-9_=-]+$/u.test(slug)
    )
      return action("invalid");
    if (this.activeSlug !== null) return action("denied");
    if (this.mode !== "real" || !this.effects)
      return action("unsupported", [
        {
          eventType: "invoice_closed",
          eventData: { slug, status: "cancelled" },
        },
      ]);
    const generation = this.generation;
    this.activeSlug = slug;
    try {
      const status = await this.effects.openInvoice(slug);
      if (generation !== this.generation || this.activeSlug !== slug)
        return action("stale");
      return action(
        status === "paid"
          ? "applied"
          : status === "pending"
            ? "applied"
            : status === "cancelled"
              ? "denied"
              : "denied",
        [{ eventType: "invoice_closed", eventData: { slug, status } }],
      );
    } catch {
      if (generation !== this.generation || this.activeSlug !== slug)
        return action("stale");
      return action("denied", [
        { eventType: "invoice_closed", eventData: { slug, status: "failed" } },
      ]);
    } finally {
      if (this.activeSlug === slug) this.activeSlug = null;
    }
  }

  private receiveClosed(input: unknown): ActionResult {
    if (
      !exactRecord(input, ["slug", "status"]) ||
      typeof input.slug !== "string" ||
      !/^[A-Za-z0-9_=-]{1,256}$/u.test(input.slug) ||
      !["cancelled", "failed", "pending", "paid"].includes(String(input.status))
    )
      return action("invalid");
    if (this.activeSlug !== input.slug) return action("stale");
    return action("applied");
  }
}

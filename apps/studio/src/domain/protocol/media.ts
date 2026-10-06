import {
  type ActionResult,
  action,
  checkAction,
  exactRecord,
  safeHttpUrl,
} from "./action-utils";
import type { ProtocolEvent } from "./transport";

export interface MediaEffects {
  download(
    url: string,
    filename: string,
  ): Promise<"started" | "cancelled" | "unsupported">;
  openStory(input: {
    mediaUrl: string;
    text?: string;
    widgetLink?: { url: string; name?: string };
  }): Promise<"opened" | "cancelled" | "unsupported">;
}

/** Host effects are injected; an absent provider can never claim a download or story post. */
export class MediaProtocolService {
  private downloadActive = false;

  constructor(
    private readonly mode: "mock" | "real",
    private generation: number,
    private readonly clientVersion: string | undefined,
    private readonly effects?: MediaEffects,
  ) {}

  async handle(event: ProtocolEvent): Promise<ActionResult> {
    const checked = checkAction(
      event,
      this.generation,
      this.clientVersion,
      "04g",
      "outgoing",
    );
    if (checked) return checked;
    if (event.eventType === "web_app_request_file_download")
      return this.download(event.eventData);
    if (event.eventType === "web_app_share_to_story")
      return this.shareStory(event.eventData);
    return action("unsupported");
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return false;
    this.generation = nextGeneration;
    this.downloadActive = false;
    return true;
  }

  private async download(input: unknown): Promise<ActionResult> {
    if (!exactRecord(input, ["url", "file_name"])) return action("invalid");
    const url = safeHttpUrl(input.url, true);
    if (
      !url ||
      typeof input.file_name !== "string" ||
      !validFilename(input.file_name)
    )
      return action("invalid");
    if (this.downloadActive) return action("denied");
    if (this.mode !== "real" || !this.effects)
      return action("unsupported", [
        {
          eventType: "file_download_requested",
          eventData: { status: "cancelled" },
        },
      ]);
    const generation = this.generation;
    this.downloadActive = true;
    try {
      const result = await this.effects.download(url.href, input.file_name);
      if (generation !== this.generation) return action("stale");
      return result === "started"
        ? action("applied", [
            {
              eventType: "file_download_requested",
              eventData: { status: "downloading" },
            },
          ])
        : result === "cancelled"
          ? action("denied", [
              {
                eventType: "file_download_requested",
                eventData: { status: "cancelled" },
              },
            ])
          : action("unsupported", [
              {
                eventType: "file_download_requested",
                eventData: { status: "cancelled" },
              },
            ]);
    } catch {
      if (generation !== this.generation) return action("stale");
      return action("denied", [
        {
          eventType: "file_download_requested",
          eventData: { status: "cancelled" },
        },
      ]);
    } finally {
      if (generation === this.generation) this.downloadActive = false;
    }
  }

  private async shareStory(input: unknown): Promise<ActionResult> {
    if (
      !exactRecord(input, ["media_url"]) &&
      !exactRecord(input, ["media_url", "text"]) &&
      !exactRecord(input, ["media_url", "widget_link"]) &&
      !exactRecord(input, ["media_url", "text", "widget_link"])
    )
      return action("invalid");
    const media = safeHttpUrl(input.media_url, true);
    if (!media) return action("invalid");
    let text: string | undefined;
    if (input.text !== undefined) {
      if (typeof input.text !== "string" || input.text.trim().length > 2048)
        return action("invalid");
      text = input.text.trim();
    }
    let widgetLink: { url: string; name?: string } | undefined;
    if (input.widget_link !== undefined) {
      if (
        !exactRecord(input.widget_link, ["url"]) &&
        !exactRecord(input.widget_link, ["url", "name"])
      )
        return action("invalid");
      const url = safeHttpUrl(input.widget_link.url);
      if (!url) return action("invalid");
      if (
        input.widget_link.name !== undefined &&
        (typeof input.widget_link.name !== "string" ||
          input.widget_link.name.trim().length > 48)
      )
        return action("invalid");
      widgetLink = {
        url: url.href,
        ...(typeof input.widget_link.name === "string" &&
        input.widget_link.name.trim()
          ? { name: input.widget_link.name.trim() }
          : {}),
      };
    }
    if (this.mode !== "real" || !this.effects) return action("unsupported");
    const generation = this.generation;
    try {
      const outcome = await this.effects.openStory({
        mediaUrl: media.href,
        ...(text ? { text } : {}),
        ...(widgetLink ? { widgetLink } : {}),
      });
      if (generation !== this.generation) return action("stale");
      return action(
        outcome === "opened"
          ? "applied"
          : outcome === "cancelled"
            ? "denied"
            : "unsupported",
      );
    } catch {
      return generation === this.generation
        ? action("denied")
        : action("stale");
    }
  }
}

function validFilename(value: string): boolean {
  if (!value || value.length > 255 || value === "." || value === "..")
    return false;
  return ![...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      code <= 0x1f || code === 0x7f || character === "/" || character === "\\"
    );
  });
}

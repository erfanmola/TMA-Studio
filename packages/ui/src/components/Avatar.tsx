import { createSignal, Show } from "solid-js";
import {
  initialsFor,
  projectColorIndex,
  telegramColorIndex,
} from "./avatar-color";

type AvatarSource =
  | { kind: "user"; telegramId: string; colorOverride?: number | null }
  | { kind: "project"; colorIndex: number | null | undefined };

export type AvatarProps = AvatarSource & {
  class?: string;
  imageUrl?: string;
  /** Accessible name when the avatar stands alone; omit when a visible name is adjacent. */
  label?: string;
  locale?: string;
  name: string;
  size?: "small" | "large";
};

export function Avatar(props: AvatarProps) {
  const [failedUrl, setFailedUrl] = createSignal<string | undefined>();
  const colorIndex = () =>
    props.kind === "user"
      ? telegramColorIndex(props.telegramId, props.colorOverride)
      : projectColorIndex(props.colorIndex);
  const image = () =>
    props.imageUrl && props.imageUrl !== failedUrl()
      ? props.imageUrl
      : undefined;

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is "img" exactly when aria-label is set.
    <span
      aria-hidden={props.label ? undefined : "true"}
      aria-label={props.label}
      class={`studio-avatar studio-avatar--${props.kind} studio-avatar--${props.size ?? "small"}${props.class ? ` ${props.class}` : ""}`}
      data-color={colorIndex()}
      role={props.label ? "img" : undefined}
    >
      <Show
        fallback={
          <span class="studio-avatar__initials">
            {initialsFor(props.name, props.locale)}
          </span>
        }
        when={image()}
      >
        {(url) => (
          <img
            alt=""
            class="studio-avatar__image"
            decoding="async"
            draggable={false}
            onError={() => setFailedUrl(url())}
            referrerpolicy="no-referrer"
            src={url()}
          />
        )}
      </Show>
    </span>
  );
}

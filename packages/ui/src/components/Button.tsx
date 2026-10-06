import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

export type ButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "class" | "children"
> & {
  children: JSX.Element;
  class?: string;
  loading?: boolean;
  size?: "default" | "small" | "comfortable";
  variant?: "primary" | "secondary" | "quiet" | "danger";
};

export function Button(props: ButtonProps) {
  const attributes = omit(
    props,
    "children",
    "class",
    "disabled",
    "loading",
    "size",
    "type",
    "variant",
    "aria-busy",
  );

  return (
    <button
      {...attributes}
      aria-busy={props.loading ? "true" : undefined}
      class={`studio-button studio-button--${props.variant ?? "secondary"} studio-button--${props.size ?? "default"}${props.loading ? " is-loading" : ""}${props.class ? ` ${props.class}` : ""}`}
      disabled={props.disabled || props.loading}
      type={props.type ?? "button"}
    >
      <span aria-hidden="true" class="studio-button__spinner" />
      <span class="studio-button__label">{props.children}</span>
    </button>
  );
}

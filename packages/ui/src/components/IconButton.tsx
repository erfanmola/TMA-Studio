import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

export type IconButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "class" | "children" | "aria-label"
> & {
  "aria-label": string;
  children: JSX.Element;
  class?: string;
  loading?: boolean;
};

export function IconButton(props: IconButtonProps) {
  const attributes = omit(
    props,
    "aria-label",
    "children",
    "class",
    "disabled",
    "loading",
    "type",
    "aria-busy",
  );

  return (
    <button
      {...attributes}
      aria-busy={props.loading ? "true" : undefined}
      aria-label={props["aria-label"]}
      class={`studio-icon-button${props.loading ? " is-loading" : ""}${props.class ? ` ${props.class}` : ""}`}
      disabled={props.disabled || props.loading}
      type={props.type ?? "button"}
    >
      <span aria-hidden="true" class="studio-icon-button__spinner" />
      <span aria-hidden="true" class="studio-icon-button__icon">
        {props.children}
      </span>
    </button>
  );
}

import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

export type SwitchProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "children" | "class" | "id" | "onClick" | "role" | "type"
> & {
  checked: boolean;
  class?: string;
  description?: string;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch(props: SwitchProps) {
  const attributes = omit(
    props,
    "checked",
    "class",
    "description",
    "id",
    "label",
    "onCheckedChange",
  );

  return (
    <div
      class={`studio-switch-row${props.class ? ` ${props.class}` : ""}`}
      data-disabled={props.disabled ? "true" : undefined}
    >
      <div class="studio-switch-row__text">
        <label class="studio-switch-row__label" for={props.id}>
          {props.label}
        </label>
        {props.description ? (
          <p
            class="studio-switch-row__description"
            id={`${props.id}-description`}
          >
            {props.description}
          </p>
        ) : null}
      </div>
      <button
        {...attributes}
        aria-checked={props.checked ? "true" : "false"}
        aria-describedby={
          props.description ? `${props.id}-description` : undefined
        }
        class="studio-switch"
        id={props.id}
        onClick={() => props.onCheckedChange(!props.checked)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" class="studio-switch__thumb" />
      </button>
    </div>
  );
}

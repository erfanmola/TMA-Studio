import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";
import { describedByIds, focusLeavesControl } from "./accessibility";
import { FieldRow } from "./FieldRow";

export type TextFieldProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  | "aria-describedby"
  | "aria-invalid"
  | "class"
  | "id"
  | "onInput"
  | "type"
  | "value"
> & {
  "aria-describedby"?: string;
  "aria-invalid"?: "false" | "true" | "grammar" | "spelling";
  class?: string;
  description?: string;
  error?: string;
  id: string;
  label: string;
  onControlExit?: () => void;
  onValueChange: (value: string) => void;
  required?: boolean;
  trailingAction?: JSX.Element;
  type?: JSX.InputHTMLAttributes<HTMLInputElement>["type"];
  value: string;
};

export function TextField(props: TextFieldProps) {
  const attributes = omit(
    props,
    "aria-describedby",
    "aria-invalid",
    "class",
    "description",
    "error",
    "id",
    "label",
    "onControlExit",
    "onValueChange",
    "required",
    "trailingAction",
    "type",
    "value",
  );

  return (
    <FieldRow
      class={props.class}
      description={props.description}
      error={props.error}
      id={props.id}
      label={props.label}
      required={props.required}
    >
      <div
        class="studio-input-shell"
        data-disabled={props.disabled ? "true" : undefined}
        onFocusOut={(event) => {
          if (
            focusLeavesControl(
              event.currentTarget.contains.bind(event.currentTarget),
              event.relatedTarget as Node | null,
            )
          ) {
            props.onControlExit?.();
          }
        }}
      >
        <input
          {...attributes}
          aria-describedby={describedByIds(
            props["aria-describedby"],
            props.id,
            props.description,
            props.error,
          )}
          aria-invalid={props.error ? "true" : props["aria-invalid"]}
          class="studio-text-field"
          id={props.id}
          onInput={(event) => props.onValueChange(event.currentTarget.value)}
          required={props.required}
          type={props.type ?? "text"}
          value={props.value}
        />
        {props.trailingAction}
      </div>
    </FieldRow>
  );
}

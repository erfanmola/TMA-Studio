import type { JSX } from "@solidjs/web";
import { For, omit } from "solid-js";
import { describedByIds } from "./accessibility";
import type { ChoiceOption } from "./combobox-state";
import { FieldRow } from "./FieldRow";

export type SelectProps = Omit<
  JSX.SelectHTMLAttributes<HTMLSelectElement>,
  | "aria-describedby"
  | "children"
  | "class"
  | "id"
  | "onChange"
  | "onInput"
  | "value"
> & {
  "aria-describedby"?: string;
  class?: string;
  description?: string;
  error?: string;
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly ChoiceOption[];
  required?: boolean;
  value: string;
};

/** Native select: platform keyboard, typeahead and Escape semantics. */
export function Select(props: SelectProps) {
  const attributes = omit(
    props,
    "aria-describedby",
    "class",
    "description",
    "error",
    "id",
    "label",
    "onValueChange",
    "options",
    "required",
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
        class="studio-select-shell"
        data-disabled={props.disabled ? "true" : undefined}
      >
        <select
          {...attributes}
          aria-describedby={describedByIds(
            props["aria-describedby"],
            props.id,
            props.description,
            props.error,
          )}
          aria-invalid={props.error ? "true" : undefined}
          class="studio-select"
          id={props.id}
          onChange={(event) => {
            const element = event.currentTarget;
            props.onValueChange(element.value);
            // Stay controlled: the owner may reject the change.
            queueMicrotask(() => {
              if (element.value !== props.value) element.value = props.value;
            });
          }}
          required={props.required}
          value={props.value}
        >
          <For each={props.options}>
            {(option) => (
              <option
                disabled={option.disabled}
                selected={option.value === props.value}
                value={option.value}
              >
                {option.label}
              </option>
            )}
          </For>
        </select>
        <svg
          aria-hidden="true"
          class="studio-select-shell__chevron"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="m7 10 5 5 5-5"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </div>
    </FieldRow>
  );
}

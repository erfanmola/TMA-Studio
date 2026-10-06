import type { JSX } from "@solidjs/web";

export { describedByIds } from "./accessibility";

export type FieldRowProps = {
  children: JSX.Element;
  class?: string;
  description?: string;
  error?: string;
  id: string;
  label: string;
  required?: boolean;
};

export function FieldRow(props: FieldRowProps) {
  return (
    <div
      class={`studio-field-row${props.error ? " is-invalid" : ""}${props.class ? ` ${props.class}` : ""}`}
      data-invalid={props.error ? "true" : undefined}
    >
      <label
        class="studio-field-row__label"
        for={props.id}
        id={`${props.id}-label`}
      >
        {props.label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {props.children}
      {props.description ? (
        <p class="studio-field-row__description" id={`${props.id}-description`}>
          {props.description}
        </p>
      ) : null}
      {props.error ? (
        <p
          class="studio-field-row__error"
          id={`${props.id}-error`}
          role="alert"
        >
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

import { createSignal, omit } from "solid-js";
import { IconButton } from "./IconButton";
import { TextField, type TextFieldProps } from "./TextField";

export type SecretFieldProps = Omit<
  TextFieldProps,
  "trailingAction" | "type"
> & {
  hideLabel: string;
  revealLabel: string;
};

export function SecretField(props: SecretFieldProps) {
  const [revealed, setRevealed] = createSignal(false);
  const fieldProps = omit(props, "hideLabel", "revealLabel");

  return (
    <TextField
      {...fieldProps}
      onControlExit={() => {
        setRevealed(false);
        props.onControlExit?.();
      }}
      trailingAction={
        <IconButton
          aria-label={revealed() ? props.hideLabel : props.revealLabel}
          aria-pressed={revealed() ? "true" : "false"}
          onClick={() => setRevealed((current) => !current)}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            role="presentation"
            viewBox="0 0 24 24"
          >
            <path
              d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.7"
            />
            <circle
              cx="12"
              cy="12"
              r="2.5"
              stroke="currentColor"
              stroke-width="1.7"
            />
          </svg>
        </IconButton>
      }
      type={revealed() ? "text" : "password"}
    />
  );
}

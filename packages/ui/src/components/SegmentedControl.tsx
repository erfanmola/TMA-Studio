import { For } from "solid-js";
import type { ChoiceOption } from "./combobox-state";
import { moveIndex } from "./navigation";
import { directionOf } from "./popup";

export type SegmentedControlProps = {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  class?: string;
  disabled?: boolean;
  id: string;
  onValueChange: (value: string) => void;
  options: readonly ChoiceOption[];
  value: string;
};

/** Single-choice radio group with roving focus; selection follows focus. */
export function SegmentedControl(props: SegmentedControlProps) {
  const unavailable = (index: number) =>
    props.disabled === true || props.options[index]?.disabled === true;
  const focusIndex = () => {
    const selected = props.options.findIndex(
      (option, index) => option.value === props.value && !unavailable(index),
    );
    return selected >= 0
      ? selected
      : props.options.findIndex((_, index) => !unavailable(index));
  };

  return (
    <div
      aria-disabled={props.disabled ? "true" : undefined}
      aria-label={props["aria-label"]}
      aria-labelledby={props["aria-labelledby"]}
      class={`studio-segmented${props.class ? ` ${props.class}` : ""}`}
      id={props.id}
      onKeyDown={(event) => {
        const group = event.currentTarget;
        const current = Number(
          (event.target as HTMLElement).dataset.index ?? -1,
        );
        const next = moveIndex(event.key, {
          count: props.options.length,
          current,
          direction: directionOf(group),
          isDisabled: unavailable,
          orientation: "horizontal",
        });
        if (next === null) return;
        event.preventDefault();
        const option = props.options[next];
        if (!option) return;
        group.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
        if (option.value !== props.value) props.onValueChange(option.value);
      }}
      role="radiogroup"
    >
      <For each={props.options}>
        {(option, index) => (
          // biome-ignore lint/a11y/useSemanticElements: roving radio buttons keep arrow keys direction-aware in RTL.
          <button
            aria-checked={option.value === props.value ? "true" : "false"}
            class="studio-segmented__option"
            data-index={index()}
            disabled={unavailable(index())}
            id={`${props.id}-${option.value}`}
            onClick={() => {
              if (option.value !== props.value) {
                props.onValueChange(option.value);
              }
            }}
            role="radio"
            tabindex={index() === focusIndex() ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

import {
  createEffect,
  createSignal,
  For,
  flush,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import { describedByIds } from "./accessibility";
import {
  type ChoiceOption,
  type ComboBoxEvent,
  initialComboBoxState,
  reduceComboBox,
  visibleOptions,
} from "./combobox-state";
import { FieldRow } from "./FieldRow";
import { trackPopup } from "./popup";

export type ComboBoxProps = {
  "aria-describedby"?: string;
  class?: string;
  description?: string;
  disabled?: boolean;
  emptyLabel: string;
  error?: string;
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly ChoiceOption[];
  required?: boolean;
  value: string | null;
};

/** Editable combobox with a filtered listbox (WAI-ARIA APG pattern). */
export function ComboBox(props: ComboBoxProps) {
  let current = untrack(() => initialComboBoxState(props.options, props.value));
  const [state, setState] = createSignal(current);
  let shell: HTMLDivElement | undefined;
  let listbox: HTMLDivElement | undefined;
  let release: (() => void) | undefined;

  const optionId = (index: number) => `${props.id}-option-${index}`;
  const list = () => visibleOptions(props.options, state().query);

  const dispatch = (
    event: ComboBoxEvent,
    options = props.options,
    value = props.value,
    settle = true,
  ) => {
    const wasOpen = current.open;
    const result = reduceComboBox(current, event, options, value);
    current = result.state;
    setState(current);
    if (result.commit !== undefined && result.commit !== value) {
      props.onValueChange(result.commit);
    }
    if (!settle) return;
    flush();
    if (current.open && shell) {
      if (!wasOpen) {
        release = trackPopup(
          shell,
          () => listbox,
          () => dispatch({ type: "dismiss" }),
        );
      }
      listbox
        ?.querySelector(`#${CSS.escape(optionId(current.activeIndex))}`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (wasOpen) {
      release?.();
      release = undefined;
    }
  };

  // Follow external value/option changes while the list is closed.
  createEffect(
    () => [props.options, props.value] as const,
    ([options, value]) => {
      if (!current.open) dispatch({ type: "sync" }, options, value, false);
    },
  );
  onCleanup(() => release?.());

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
        class="studio-input-shell studio-combobox"
        data-disabled={props.disabled ? "true" : undefined}
        ref={(element) => {
          shell = element;
        }}
      >
        <input
          aria-activedescendant={
            state().open && state().activeIndex >= 0
              ? optionId(state().activeIndex)
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={`${props.id}-listbox`}
          aria-describedby={describedByIds(
            props["aria-describedby"],
            props.id,
            props.description,
            props.error,
          )}
          aria-expanded={state().open ? "true" : "false"}
          aria-invalid={props.error ? "true" : undefined}
          autocomplete="off"
          class="studio-text-field"
          disabled={props.disabled}
          id={props.id}
          onBlur={() => dispatch({ type: "dismiss" })}
          onInput={(event) =>
            dispatch({ text: event.currentTarget.value, type: "input" })
          }
          onKeyDown={(event) => {
            const handled =
              event.key === "ArrowDown" ||
              event.key === "ArrowUp" ||
              (event.key === "Enter" && current.open) ||
              (event.key === "Escape" && current.open);
            if (handled) {
              event.preventDefault();
              if (event.key === "Escape") event.stopPropagation();
            }
            dispatch({ key: event.key, type: "key" });
          }}
          required={props.required}
          role="combobox"
          spellcheck={false}
          type="text"
          value={state().text}
        />
        <svg
          aria-hidden="true"
          class="studio-combobox__chevron"
          fill="none"
          onPointerDown={(event) => {
            event.preventDefault();
            if (props.disabled) return;
            const input = shell?.querySelector("input");
            input?.focus();
            dispatch(
              current.open
                ? { type: "dismiss" }
                : { key: "ArrowDown", type: "key" },
            );
          }}
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
      <Show when={state().open}>
        <div
          aria-labelledby={`${props.id}-label`}
          class="studio-popup studio-listbox"
          id={`${props.id}-listbox`}
          onPointerDown={(event) => event.preventDefault()}
          ref={(element) => {
            listbox = element;
          }}
          role="listbox"
        >
          <For each={list()}>
            {(option, index) => (
              // Options stay unfocusable: DOM focus remains in the input and the
              // active option is exposed through aria-activedescendant.
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled by the combobox input.
              // biome-ignore lint/a11y/useFocusableInteractive: active option uses aria-activedescendant.
              <div
                aria-disabled={option.disabled ? "true" : undefined}
                aria-selected={option.value === props.value ? "true" : "false"}
                class={`studio-listbox__option${index() === state().activeIndex ? " is-active" : ""}`}
                id={optionId(index())}
                onClick={() => dispatch({ index: index(), type: "choose" })}
                role="option"
              >
                {option.label}
              </div>
            )}
          </For>
          <Show when={list().length === 0}>
            <div class="studio-listbox__empty" role="presentation">
              {props.emptyLabel}
            </div>
          </Show>
        </div>
      </Show>
    </FieldRow>
  );
}

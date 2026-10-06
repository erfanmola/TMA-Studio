import type { JSX } from "@solidjs/web";
import { createSignal, For, flush, onCleanup, Show } from "solid-js";
import {
  firstEnabled,
  lastEnabled,
  moveIndex,
  typeaheadIndex,
} from "./navigation";
import { trackPopup } from "./popup";

export type MenuItem = {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  value: string;
};

export type MenuProps = {
  "aria-label"?: string;
  children: JSX.Element;
  class?: string;
  disabled?: boolean;
  id: string;
  items: readonly MenuItem[];
  onAction: (value: string) => void;
  size?: "default" | "small";
};

/** Menu button (WAI-ARIA APG) for commands, never for value selection. */
export function Menu(props: MenuProps) {
  const [open, setOpen] = createSignal(false);
  let trigger: HTMLButtonElement | undefined;
  let popup: HTMLDivElement | undefined;
  let release: (() => void) | undefined;
  let typed = "";
  let typedAt = 0;

  const unavailable = (index: number) => props.items[index]?.disabled === true;
  const itemAt = (index: number) =>
    popup?.querySelector<HTMLElement>(`[data-index="${index}"]`);
  const focusedIndex = () =>
    Number((document.activeElement as HTMLElement | null)?.dataset.index ?? -1);

  const close = (restoreFocus: boolean) => {
    release?.();
    release = undefined;
    setOpen(false);
    if (restoreFocus) trigger?.focus();
  };
  const show = (index: number | null) => {
    if (!trigger || props.disabled) return;
    setOpen(true);
    flush();
    release?.();
    release = trackPopup(
      trigger,
      () => popup,
      () => close(false),
    );
    if (index !== null) itemAt(index)?.focus();
    else popup?.focus();
  };
  const activate = (index: number) => {
    const item = props.items[index];
    if (!item || item.disabled) return;
    close(true);
    props.onAction(item.value);
  };
  onCleanup(() => release?.());

  return (
    <>
      <button
        aria-controls={open() ? `${props.id}-menu` : undefined}
        aria-expanded={open() ? "true" : "false"}
        aria-haspopup="menu"
        aria-label={props["aria-label"]}
        class={`studio-button studio-button--secondary studio-button--${props.size ?? "default"} studio-menu-button${props.class ? ` ${props.class}` : ""}`}
        disabled={props.disabled}
        id={`${props.id}-button`}
        onClick={() =>
          open()
            ? close(true)
            : show(firstEnabled(props.items.length, unavailable))
        }
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show(
              event.key === "ArrowDown"
                ? firstEnabled(props.items.length, unavailable)
                : lastEnabled(props.items.length, unavailable),
            );
          }
        }}
        ref={(element) => {
          trigger = element;
        }}
        type="button"
      >
        <span class="studio-button__label">{props.children}</span>
        <svg
          aria-hidden="true"
          class="studio-menu-button__chevron"
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
      </button>
      <Show when={open()}>
        <div
          aria-labelledby={`${props.id}-button`}
          class="studio-popup studio-menu"
          id={`${props.id}-menu`}
          onKeyDown={(event) => {
            const current = focusedIndex();
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close(true);
              return;
            }
            if (event.key === "Tab") {
              close(false);
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activate(current);
              return;
            }
            const next = moveIndex(event.key, {
              count: props.items.length,
              current,
              isDisabled: unavailable,
              orientation: "vertical",
            });
            if (next !== null) {
              event.preventDefault();
              itemAt(next)?.focus();
              return;
            }
            if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              const now = event.timeStamp;
              typed = now - typedAt < 500 ? typed + event.key : event.key;
              typedAt = now;
              const match = typeaheadIndex(
                props.items.map((item) => item.label),
                current,
                typed,
                unavailable,
              );
              if (match !== null) itemAt(match)?.focus();
            }
          }}
          ref={(element) => {
            popup = element;
          }}
          role="menu"
          tabindex="-1"
        >
          <For each={props.items}>
            {(item, index) => (
              <button
                aria-disabled={item.disabled ? "true" : undefined}
                class={`studio-menu__item${item.danger ? " is-danger" : ""}`}
                data-index={index()}
                id={`${props.id}-item-${item.value}`}
                onClick={() => activate(index())}
                onPointerMove={(event) => {
                  if (!item.disabled) event.currentTarget.focus();
                }}
                role="menuitem"
                tabindex="-1"
                type="button"
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";
import { moveIndex } from "./navigation";

export type SidebarItem = {
  disabled?: boolean;
  id: string;
  leading?: JSX.Element;
  subtitle?: string;
  title: string;
};

export type SidebarListProps = {
  class?: string;
  emptyLabel: string;
  id: string;
  items: readonly SidebarItem[];
  label: string;
  onSelect: (id: string) => void;
  selectedId?: string;
  /** Optional per-row secondary action rendered outside the row button. */
  trailing?: (item: SidebarItem) => JSX.Element;
};

/** Sidebar navigation: one tab stop, arrows move focus, Enter/Space open. */
export function SidebarList(props: SidebarListProps) {
  const disabled = (index: number) => props.items[index]?.disabled === true;
  const tabStop = () => {
    const selected = props.items.findIndex(
      (item, index) => item.id === props.selectedId && !disabled(index),
    );
    return selected >= 0
      ? selected
      : props.items.findIndex((_, i) => !disabled(i));
  };

  return (
    <nav
      aria-labelledby={`${props.id}-heading`}
      class={`studio-sidebar-list${props.class ? ` ${props.class}` : ""}`}
    >
      <h3 class="studio-sidebar-list__heading" id={`${props.id}-heading`}>
        {props.label}
      </h3>
      <Show
        fallback={<p class="studio-sidebar-list__empty">{props.emptyLabel}</p>}
        when={props.items.length > 0}
      >
        <ul
          class="studio-sidebar-list__items"
          onKeyDown={(event) => {
            const target = event.target as HTMLElement;
            if (!target.matches(".studio-sidebar-list__row")) return;
            const next = moveIndex(event.key, {
              count: props.items.length,
              current: Number(target.dataset.index ?? -1),
              isDisabled: disabled,
              loop: false,
              orientation: "vertical",
            });
            if (next === null) return;
            event.preventDefault();
            event.currentTarget
              .querySelector<HTMLElement>(
                `.studio-sidebar-list__row[data-index="${next}"]`,
              )
              ?.focus();
          }}
        >
          <For each={props.items}>
            {(item, index) => (
              <li class="studio-sidebar-list__item">
                <button
                  aria-current={
                    item.id === props.selectedId ? "true" : undefined
                  }
                  class="studio-sidebar-list__row"
                  data-index={index()}
                  disabled={item.disabled}
                  id={`${props.id}-${item.id}`}
                  onClick={() => props.onSelect(item.id)}
                  tabindex={index() === tabStop() ? 0 : -1}
                  type="button"
                >
                  {item.leading}
                  <span class="studio-sidebar-list__text">
                    <span class="studio-sidebar-list__title">{item.title}</span>
                    <Show when={item.subtitle}>
                      <span class="studio-sidebar-list__subtitle">
                        {item.subtitle}
                      </span>
                    </Show>
                  </span>
                </button>
                {props.trailing?.(item)}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </nav>
  );
}

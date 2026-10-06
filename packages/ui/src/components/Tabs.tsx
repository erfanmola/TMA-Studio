import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import { moveIndex } from "./navigation";
import { directionOf } from "./popup";

export type TabItem = {
  disabled?: boolean;
  icon?: JSX.Element;
  label: string;
  value: string;
};

export type TabsProps = {
  "aria-label": string;
  class?: string;
  id: string;
  onValueChange: (value: string) => void;
  panel: (value: string) => JSX.Element;
  tabs: readonly TabItem[];
  value: string;
};

/** APG tabs with automatic activation and direction-aware arrows. */
export function Tabs(props: TabsProps) {
  const tabId = (value: string) => `${props.id}-tab-${value}`;
  const disabled = (index: number) => props.tabs[index]?.disabled === true;

  return (
    <div class={`studio-tabs${props.class ? ` ${props.class}` : ""}`}>
      <div
        aria-label={props["aria-label"]}
        aria-orientation="horizontal"
        class="studio-tabs__list"
        onKeyDown={(event) => {
          const list = event.currentTarget;
          const next = moveIndex(event.key, {
            count: props.tabs.length,
            current: Number((event.target as HTMLElement).dataset.index ?? -1),
            direction: directionOf(list),
            isDisabled: disabled,
            orientation: "horizontal",
          });
          if (next === null) return;
          event.preventDefault();
          const tab = props.tabs[next];
          if (!tab) return;
          list.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
          if (tab.value !== props.value) props.onValueChange(tab.value);
        }}
        role="tablist"
      >
        <For each={props.tabs}>
          {(tab, index) => (
            <button
              aria-controls={
                tab.value === props.value ? `${props.id}-panel` : undefined
              }
              aria-selected={tab.value === props.value ? "true" : "false"}
              class="studio-tabs__tab"
              data-index={index()}
              disabled={tab.disabled}
              id={tabId(tab.value)}
              onClick={() => {
                if (tab.value !== props.value) props.onValueChange(tab.value);
              }}
              role="tab"
              tabindex={tab.value === props.value ? 0 : -1}
              type="button"
            >
              {tab.icon ? (
                <span aria-hidden="true" class="studio-tabs__icon">
                  {tab.icon}
                </span>
              ) : null}
              <span class="studio-tabs__label">{tab.label}</span>
            </button>
          )}
        </For>
      </div>
      <div
        aria-labelledby={tabId(props.value)}
        class="studio-tabs__panel"
        id={`${props.id}-panel`}
        role="tabpanel"
        tabindex="0"
      >
        {props.panel(props.value)}
      </div>
    </div>
  );
}

import { firstEnabled, lastEnabled, moveIndex } from "./navigation";

export type ChoiceOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

export type ComboBoxState = {
  activeIndex: number;
  open: boolean;
  /** Filter text; null lists every option (opened without typing). */
  query: string | null;
  text: string;
};

export type ComboBoxEvent =
  | { type: "input"; text: string }
  | { type: "key"; key: string }
  | { type: "choose"; index: number }
  | { type: "dismiss" }
  | { type: "sync" };

export type ComboBoxResult = {
  commit?: string;
  state: ComboBoxState;
};

export function labelFor(
  options: readonly ChoiceOption[],
  value: string | null,
): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

export function visibleOptions(
  options: readonly ChoiceOption[],
  query: string | null,
): ChoiceOption[] {
  if (query === null || query.trim() === "") return [...options];
  const needle = query.trim().toLocaleLowerCase();
  return options.filter((option) =>
    option.label.toLocaleLowerCase().includes(needle),
  );
}

export function initialComboBoxState(
  options: readonly ChoiceOption[],
  value: string | null,
): ComboBoxState {
  return {
    activeIndex: -1,
    open: false,
    query: null,
    text: labelFor(options, value),
  };
}

/**
 * Editable combobox with list autocomplete (WAI-ARIA APG). The committed value
 * changes only through an explicit choice; Escape, blur and Tab close the list
 * and restore the committed label instead of clearing the value.
 */
export function reduceComboBox(
  state: ComboBoxState,
  event: ComboBoxEvent,
  options: readonly ChoiceOption[],
  value: string | null,
): ComboBoxResult {
  const restore = (): ComboBoxResult => ({
    state: { ...initialComboBoxState(options, value) },
  });
  const list = visibleOptions(options, state.query);
  const disabledIn = (items: readonly ChoiceOption[]) => (index: number) =>
    items[index]?.disabled === true;
  const commit = (option: ChoiceOption | undefined): ComboBoxResult => {
    if (!option || option.disabled) return { state };
    return {
      commit: option.value,
      state: initialComboBoxState(options, option.value),
    };
  };

  switch (event.type) {
    case "sync":
      return state.open ? { state } : restore();
    case "dismiss":
      return restore();
    case "choose":
      return commit(list[event.index]);
    case "input": {
      const next = visibleOptions(options, event.text);
      return {
        state: {
          activeIndex: firstEnabled(next.length, disabledIn(next)) ?? -1,
          open: true,
          query: event.text,
          text: event.text,
        },
      };
    }
    case "key": {
      const { key } = event;
      if (key === "Escape" || key === "Tab") return restore();
      if (key === "Enter") {
        if (!state.open) return { state };
        return state.activeIndex >= 0
          ? commit(list[state.activeIndex])
          : restore();
      }
      if (key !== "ArrowDown" && key !== "ArrowUp") return { state };
      if (!state.open) {
        const all = visibleOptions(options, null);
        const selected = all.findIndex(
          (option) => option.value === value && !option.disabled,
        );
        const fallback =
          key === "ArrowDown"
            ? firstEnabled(all.length, disabledIn(all))
            : lastEnabled(all.length, disabledIn(all));
        return {
          state: {
            ...state,
            activeIndex: selected >= 0 ? selected : (fallback ?? -1),
            open: true,
            query: null,
          },
        };
      }
      const next = moveIndex(key, {
        count: list.length,
        current: state.activeIndex,
        isDisabled: disabledIn(list),
        orientation: "vertical",
      });
      return { state: { ...state, activeIndex: next ?? state.activeIndex } };
    }
  }
}

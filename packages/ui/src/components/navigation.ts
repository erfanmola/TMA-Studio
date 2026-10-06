export type Direction = "ltr" | "rtl";
export type Orientation = "horizontal" | "vertical";

export type NavigationOptions = {
  count: number;
  current: number;
  direction?: Direction;
  isDisabled?: (index: number) => boolean;
  loop?: boolean;
  orientation: Orientation;
};

function step(
  options: NavigationOptions,
  from: number,
  delta: 1 | -1,
): number | null {
  const { count, isDisabled = () => false, loop = true } = options;
  for (let offset = 1; offset <= count; offset += 1) {
    let index = from + delta * offset;
    if (index < 0 || index >= count) {
      if (!loop) return null;
      index = (index + count) % count;
    }
    if (!isDisabled(index)) return index;
  }
  return null;
}

export function firstEnabled(
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): number | null {
  for (let index = 0; index < count; index += 1) {
    if (!isDisabled(index)) return index;
  }
  return null;
}

export function lastEnabled(
  count: number,
  isDisabled: (index: number) => boolean = () => false,
): number | null {
  for (let index = count - 1; index >= 0; index -= 1) {
    if (!isDisabled(index)) return index;
  }
  return null;
}

/**
 * Resolves roving-focus movement for arrow, Home and End keys. Horizontal
 * arrows follow the visual direction, so ArrowLeft moves forward in RTL.
 * Returns null for keys that do not move focus.
 */
export function moveIndex(
  key: string,
  options: NavigationOptions,
): number | null {
  const {
    count,
    current,
    direction = "ltr",
    isDisabled,
    orientation,
  } = options;
  if (count === 0) return null;
  if (key === "Home") return firstEnabled(count, isDisabled);
  if (key === "End") return lastEnabled(count, isDisabled);

  const forward =
    orientation === "vertical"
      ? "ArrowDown"
      : direction === "rtl"
        ? "ArrowLeft"
        : "ArrowRight";
  const backward =
    orientation === "vertical"
      ? "ArrowUp"
      : direction === "rtl"
        ? "ArrowRight"
        : "ArrowLeft";

  if (key === forward) {
    return current < 0
      ? firstEnabled(count, isDisabled)
      : step(options, current, 1);
  }
  if (key === backward) {
    return current < 0
      ? lastEnabled(count, isDisabled)
      : step(options, current, -1);
  }
  return null;
}

/** Finds the next enabled label starting with the typed prefix. */
export function typeaheadIndex(
  labels: readonly string[],
  current: number,
  query: string,
  isDisabled: (index: number) => boolean = () => false,
): number | null {
  const needle = query.toLocaleLowerCase();
  if (needle.length === 0) return null;
  const start = needle.length === 1 ? current + 1 : Math.max(current, 0);
  for (let offset = 0; offset < labels.length; offset += 1) {
    const index = (start + offset) % labels.length;
    if (
      !isDisabled(index) &&
      labels[index]?.toLocaleLowerCase().startsWith(needle)
    ) {
      return index;
    }
  }
  return null;
}

export type Rect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type PopupPlacement = {
  left: number;
  maxHeight: number;
  side: "above" | "below";
  top: number;
  width: number;
};

/**
 * Places a popup against its anchor inside the viewport. It opens below when
 * the preferred height fits (or below has more room), aligns to the inline
 * start edge for the direction, and clamps to the viewport margin.
 */
export function placePopup(options: {
  anchor: Rect;
  direction?: Direction;
  margin?: number;
  minWidth?: number;
  offset?: number;
  preferredHeight: number;
  preferredWidth: number;
  viewport: { height: number; width: number };
}): PopupPlacement {
  const {
    anchor,
    direction = "ltr",
    margin = 8,
    offset = 4,
    preferredHeight,
    viewport,
  } = options;
  const anchorWidth = anchor.right - anchor.left;
  const width = Math.min(
    Math.max(options.preferredWidth, options.minWidth ?? anchorWidth),
    Math.max(viewport.width - margin * 2, 0),
  );
  const spaceBelow = viewport.height - anchor.bottom - offset - margin;
  const spaceAbove = anchor.top - offset - margin;
  const side =
    preferredHeight <= spaceBelow || spaceBelow >= spaceAbove
      ? "below"
      : "above";
  const maxHeight = Math.max(
    Math.min(preferredHeight, side === "below" ? spaceBelow : spaceAbove),
    0,
  );
  const top =
    side === "below" ? anchor.bottom + offset : anchor.top - offset - maxHeight;
  const preferredLeft =
    direction === "rtl" ? anchor.right - width : anchor.left;
  const left = Math.min(
    Math.max(preferredLeft, margin),
    Math.max(viewport.width - margin - width, margin),
  );
  return { left, maxHeight, side, top, width };
}

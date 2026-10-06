import type { Insets, LaunchMode } from "../../contracts/entities";

export interface ViewportState {
  width: number;
  height: number;
  stableHeight: number;
  isExpanded: boolean;
  isStable: boolean;
  mode: LaunchMode;
  safeArea: Insets;
  contentSafeArea: Insets;
  fullscreen: boolean;
}

export interface ViewportUpdate {
  width?: number;
  height?: number;
  is_expanded?: boolean;
  is_state_stable?: boolean;
}

export function createViewportState(input: {
  width: number;
  height: number;
  safeArea?: Insets;
  contentSafeArea?: Insets;
  mode?: LaunchMode;
}): ViewportState {
  const width = metric(input.width, "width");
  const height = metric(input.height, "height");
  return {
    width,
    height,
    stableHeight: height,
    isExpanded: (input.mode ?? "overlay") !== "overlay",
    isStable: true,
    mode: input.mode ?? "overlay",
    safeArea: validateInsets(input.safeArea ?? zeroInsets(), width, height),
    contentSafeArea: validateInsets(
      input.contentSafeArea ?? zeroInsets(),
      width,
      height,
    ),
    fullscreen: false,
  };
}

export function applyViewportUpdate(
  state: ViewportState,
  update: ViewportUpdate,
): ViewportState {
  const width =
    update.width === undefined ? state.width : metric(update.width, "width");
  const height =
    update.height === undefined
      ? state.height
      : metric(update.height, "height");
  const isStable = update.is_state_stable ?? state.isStable;
  return {
    ...state,
    width,
    height,
    stableHeight: isStable ? height : state.stableHeight,
    isStable,
    isExpanded: update.is_expanded ?? state.isExpanded,
  };
}

export function setLaunchMode(
  state: ViewportState,
  mode: LaunchMode,
): ViewportState {
  return {
    ...state,
    mode,
    isExpanded: mode !== "overlay",
    fullscreen: mode === "fullscreen",
  };
}

export function applySafeArea(
  state: ViewportState,
  value: unknown,
  content = false,
): ViewportState {
  const insets = validateInsets(value as Insets, state.width, state.height);
  return content
    ? { ...state, contentSafeArea: insets }
    : { ...state, safeArea: insets };
}

export function validateInsets(
  value: Insets,
  width: number,
  height: number,
): Insets {
  const top = metric(value?.top, "safeArea.top");
  const right = metric(value?.right, "safeArea.right");
  const bottom = metric(value?.bottom, "safeArea.bottom");
  const left = metric(value?.left, "safeArea.left");
  if (top + bottom > height || left + right > width) {
    throw new TypeError("Safe area exceeds the viewport.");
  }
  return { top, right, bottom, left };
}

export function zeroInsets(): Insets {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function metric(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100_000) {
    throw new TypeError(`Invalid viewport metric: ${name}.`);
  }
  return value;
}

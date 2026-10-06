const PROJECT_WINDOW_MINIMUM = {
  // Keep the main form and section sidebar side by side past WindowShell's
  // 40rem stacking breakpoint.
  width: 641,
  // Match the Project surface's 38rem minimum content height.
  height: 608,
} as const;

const HOME_WINDOW_MINIMUM = {
  // Allow the Home scene's stacked layout below 40rem, but prevent tilers from
  // collapsing the hero and recent-project list into an unusably narrow rail.
  width: 480,
  // Match the Home scene's 28rem minimum content height.
  height: 448,
} as const;

const SETTINGS_WINDOW_MINIMUM = {
  // Keep the tab list and form usable; Settings is 48rem wide with 30rem
  // minimum content height per the management-window table.
  width: 480,
  height: 480,
} as const;

export function minimumWindowSizeForKey(
  key: string,
): { width: number; height: number } | undefined {
  if (key === "home") return HOME_WINDOW_MINIMUM;
  if (key === "settings") return SETTINGS_WINDOW_MINIMUM;
  return key.startsWith("project:") ? PROJECT_WINDOW_MINIMUM : undefined;
}

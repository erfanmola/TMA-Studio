export type ToolbarSide = "top" | "bottom" | "left" | "right";

export interface HostRect {
  width: number;
  height: number;
}

export interface GuestRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SIMULATOR_TOOLBAR_GAP = 8;
export const SIMULATOR_TOOLBAR_SIZE = 42;
export const SIMULATOR_VERTICAL_TOOLBAR_SIZE = 104;

/** Computes a guest rectangle in window-content coordinates, leaving a full rail and gap. */
export function guestRect(
  host: HostRect,
  side: ToolbarSide = "top",
  toolbarSize = SIMULATOR_TOOLBAR_SIZE,
  gap = SIMULATOR_TOOLBAR_GAP,
  expandedControlExtent = 0,
): GuestRect {
  const width = Math.max(1, Math.floor(host.width));
  const height = Math.max(1, Math.floor(host.height));
  const rail = Math.max(0, Math.floor(toolbarSize));
  const verticalRail = SIMULATOR_VERTICAL_TOOLBAR_SIZE;
  const spacing = Math.max(0, Math.floor(gap));
  const extension = Math.max(0, Math.floor(expandedControlExtent));
  switch (side) {
    case "top":
      return {
        x: 0,
        y: Math.min(height - 1, rail + spacing + extension),
        width,
        height: Math.max(1, height - rail - spacing - extension),
      };
    case "bottom":
      return {
        x: 0,
        y: 0,
        width,
        height: Math.max(1, height - rail - spacing - extension),
      };
    case "left":
      return {
        x: Math.min(width - 1, verticalRail + spacing + extension),
        y: 0,
        width: Math.max(1, width - verticalRail - spacing - extension),
        height,
      };
    case "right":
      return {
        x: 0,
        y: 0,
        width: Math.max(1, width - verticalRail - spacing - extension),
        height,
      };
  }
}

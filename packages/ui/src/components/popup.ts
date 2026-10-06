import { type Direction, placePopup } from "./navigation";

export function directionOf(element: Element): Direction {
  return getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
}

/**
 * Positions a fixed popup against its anchor so it stays inside the
 * viewport, flipping above the anchor when there is more room there.
 */
export function positionPopup(
  anchor: HTMLElement,
  popup: HTMLElement,
  maxHeight = 288,
): void {
  popup.style.maxHeight = "";
  popup.style.width = "";
  const anchorRect = anchor.getBoundingClientRect();
  const placement = placePopup({
    anchor: anchorRect,
    direction: directionOf(anchor),
    minWidth: anchorRect.width,
    preferredHeight: Math.min(popup.scrollHeight, maxHeight),
    preferredWidth: popup.offsetWidth,
    viewport: {
      height: document.documentElement.clientHeight,
      width: document.documentElement.clientWidth,
    },
  });
  popup.style.left = `${placement.left}px`;
  popup.style.maxHeight = `${placement.maxHeight}px`;
  popup.style.top = `${placement.top}px`;
  popup.style.width = `${placement.width}px`;
  popup.dataset.side = placement.side;
}

/** Keeps a popup attached while open; returns the cleanup function. */
export function trackPopup(
  anchor: HTMLElement,
  popup: () => HTMLElement | undefined,
  onOutside: () => void,
): () => void {
  const reposition = () => {
    const element = popup();
    if (element) positionPopup(anchor, element);
  };
  const outside = (event: PointerEvent) => {
    const target = event.target as Node | null;
    const element = popup();
    if (target && (anchor.contains(target) || element?.contains(target))) {
      return;
    }
    onOutside();
  };
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  document.addEventListener("pointerdown", outside, true);
  reposition();
  return () => {
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    document.removeEventListener("pointerdown", outside, true);
  };
}

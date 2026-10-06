import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

export type WindowPlatform = "macos" | "windows" | "linux";

export type WindowShellProps = {
  children: JSX.Element;
  class?: string;
  footer?: JSX.Element;
  id: string;
  platform: WindowPlatform;
  sidebar?: JSX.Element;
  title: string;
  /** Controls in the titlebar; they sit outside every drag region. */
  titlebarActions?: JSX.Element;
  toolbar?: JSX.Element;
};

/**
 * Management window frame. OS decorations stay native: the titlebar only
 * reserves their physical space. The runtime has no `no-drag` override, so
 * `-webkit-app-region: drag` is applied to non-interactive title segments
 * only and never to an element containing controls.
 */
export function WindowShell(props: WindowShellProps) {
  return (
    <div
      class={`studio-window${props.class ? ` ${props.class}` : ""}`}
      data-platform={props.platform}
      id={props.id}
    >
      <header class="studio-window__titlebar">
        <div class="studio-window__drag" data-drag-region="true">
          <h1 class="studio-window__title" id={`${props.id}-title`}>
            {props.title}
          </h1>
        </div>
        <Show when={props.titlebarActions}>
          <div class="studio-window__titlebar-actions">
            {props.titlebarActions}
          </div>
        </Show>
      </header>
      <Show when={props.toolbar}>
        <div class="studio-window__toolbar">{props.toolbar}</div>
      </Show>
      <div class="studio-window__body">
        <main aria-labelledby={`${props.id}-title`} class="studio-window__main">
          {props.children}
        </main>
        <Show when={props.sidebar}>
          <aside class="studio-window__sidebar">{props.sidebar}</aside>
        </Show>
      </div>
      <Show when={props.footer}>
        <footer class="studio-window__footer">{props.footer}</footer>
      </Show>
    </div>
  );
}

const interactive =
  "a[href],button,input,select,textarea,summary,[tabindex],[contenteditable='true']";

/** Drag regions that would swallow clicks on a control (runtime lacks no-drag). */
export function dragRegionConflicts(root: ParentNode): Element[] {
  return [...root.querySelectorAll("[data-drag-region]")].filter(
    (region) =>
      region.matches(interactive) || region.querySelector(interactive),
  );
}

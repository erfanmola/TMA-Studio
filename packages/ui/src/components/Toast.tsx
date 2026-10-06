import { createSignal, For, onCleanup, Show } from "solid-js";
import { IconButton } from "./IconButton";

export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastInput = {
  action?: { label: string; onAction: () => void };
  description?: string;
  /** Milliseconds; errors default to persistent (null). */
  duration?: number | null;
  title: string;
  tone?: ToastTone;
};

export type ToastRecord = ToastInput & { id: number; tone: ToastTone };

export type Toaster = {
  dismiss: (id: number) => void;
  pause: (id: number) => void;
  resume: (id: number) => void;
  show: (toast: ToastInput) => number;
  toasts: () => readonly ToastRecord[];
};

const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 4;

/**
 * Owner-scoped toast queue. Each timer exists only while its toast is visible
 * and unpaused, so an idle window runs no timers.
 */
export function createToaster(): Toaster {
  const [toasts, setToasts] = createSignal<readonly ToastRecord[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const remaining = new Map<number, { left: number; started: number }>();
  let current: readonly ToastRecord[] = [];
  let nextId = 1;

  const write = (next: readonly ToastRecord[]) => {
    current = next;
    setToasts(next);
  };
  const clear = (id: number) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
  };
  const start = (id: number, left: number) => {
    clear(id);
    remaining.set(id, { left, started: Date.now() });
    timers.set(
      id,
      setTimeout(() => dismiss(id), left),
    );
  };
  const dismiss = (id: number) => {
    clear(id);
    remaining.delete(id);
    write(current.filter((toast) => toast.id !== id));
  };

  onCleanup(() => {
    for (const id of timers.keys()) clear(id);
  });

  return {
    dismiss,
    pause(id) {
      const state = remaining.get(id);
      if (!state || !timers.has(id)) return;
      clear(id);
      state.left = Math.max(state.left - (Date.now() - state.started), 0);
    },
    resume(id) {
      const state = remaining.get(id);
      if (state && !timers.has(id)) start(id, state.left);
    },
    show(input) {
      const id = nextId++;
      const tone = input.tone ?? "info";
      const duration =
        input.duration !== undefined
          ? input.duration
          : tone === "error"
            ? null
            : DEFAULT_DURATION;
      const next = [...current, { ...input, id, tone }];
      for (const dropped of next.slice(
        0,
        Math.max(next.length - MAX_VISIBLE, 0),
      )) {
        clear(dropped.id);
        remaining.delete(dropped.id);
      }
      write(next.slice(-MAX_VISIBLE));
      if (duration !== null) start(id, duration);
      return id;
    },
    toasts,
  };
}

export type ToastRegionProps = {
  closeLabel: string;
  label: string;
  toaster: Toaster;
};

export function ToastRegion(props: ToastRegionProps) {
  return (
    <section aria-label={props.label} class="studio-toast-region">
      <For each={props.toaster.toasts()}>
        {(toast) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only pause auto-dismiss; role is status or alert.
          <div
            class="studio-toast"
            data-tone={toast.tone}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                props.toaster.resume(toast.id);
              }
            }}
            onFocus={() => props.toaster.pause(toast.id)}
            onPointerEnter={() => props.toaster.pause(toast.id)}
            onPointerLeave={() => props.toaster.resume(toast.id)}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <div class="studio-toast__text">
              <p class="studio-toast__title">{toast.title}</p>
              <Show when={toast.description}>
                <p class="studio-toast__description">{toast.description}</p>
              </Show>
            </div>
            <Show when={toast.action}>
              {(action) => (
                <button
                  class="studio-button studio-button--quiet studio-button--small studio-toast__action"
                  onClick={() => {
                    action().onAction();
                    props.toaster.dismiss(toast.id);
                  }}
                  type="button"
                >
                  {action().label}
                </button>
              )}
            </Show>
            <IconButton
              aria-label={props.closeLabel}
              class="studio-toast__close"
              onClick={() => props.toaster.dismiss(toast.id)}
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path
                  d="m7 7 10 10M17 7 7 17"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.8"
                />
              </svg>
            </IconButton>
          </div>
        )}
      </For>
    </section>
  );
}

import type { ManagedNativeWindow, StudioWindowRegistry } from "./windows";

/** A managed window that can be brought back when its stable key is reopened. */
export interface ReusableNativeWindow extends ManagedNativeWindow {
  show?: () => void;
  focus?: () => void;
}

/**
 * Adds stable-key ownership and empty-state notifications to the global window
 * registry. Closing and reopening a key is safe even if the old close event is
 * delivered after its replacement has been registered.
 */
export class KeyedStudioWindowRegistry<
  TWindow extends ReusableNativeWindow = ReusableNativeWindow,
> {
  private readonly windows = new Map<string, TWindow>();
  private readonly emptyListeners = new Set<() => void>();

  constructor(private readonly registry: StudioWindowRegistry) {}

  get count(): number {
    return this.windows.size;
  }

  get(key: string): TWindow | undefined {
    return this.windows.get(key);
  }

  /** Subscribe to transitions from one or more open windows to none. */
  onEmpty(listener: () => void): () => void {
    this.emptyListeners.add(listener);
    return () => this.emptyListeners.delete(listener);
  }

  /** Reuse an open key, or create and register its first window. */
  open(key: string, factory: () => TWindow): TWindow {
    this.assertKey(key);
    const current = this.windows.get(key);
    if (current) {
      if (!current.show || !current.focus) {
        throw new Error(
          "The installed Bunium runtime cannot restore and focus an existing window.",
        );
      }
      current.show();
      current.focus();
      return current;
    }

    return this.registry.create(() => {
      const window = factory();
      this.windows.set(key, window);
      window.onClose(() => this.removeIfCurrent(key, window));
      return window;
    });
  }

  /** Remove ownership before closing, so a synchronous close callback is safe. */
  close(key: string): boolean {
    const window = this.windows.get(key);
    if (!window) return false;
    this.removeIfCurrent(key, window);
    window.close();
    return true;
  }

  /** Closes every owned window; the empty transition is emitted once. */
  closeAll(): void {
    for (const key of [...this.windows.keys()]) this.close(key);
  }

  private removeIfCurrent(key: string, window: TWindow): void {
    if (this.windows.get(key) !== window) return;
    this.windows.delete(key);
    if (this.windows.size === 0) {
      for (const listener of this.emptyListeners) listener();
    }
  }

  private assertKey(key: string): void {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("Studio window keys must be non-empty strings");
    }
  }
}

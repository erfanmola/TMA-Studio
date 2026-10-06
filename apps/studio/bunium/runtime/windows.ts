export interface ManagedNativeWindow {
  close(): void;
  onClose(listener: () => void): void;
  setAlwaysOnTop?: (enabled: boolean) => void;
}

/** Applies Studio's global always-on-top preference to every owned window. */
export class StudioWindowRegistry {
  private readonly windows = new Set<ManagedNativeWindow>();
  private pinned = false;

  get alwaysOnTop(): boolean {
    return this.pinned;
  }

  register<T extends ManagedNativeWindow>(window: T): T {
    if (this.windows.has(window)) return window;
    if (this.pinned) this.apply(window, true);
    this.windows.add(window);
    window.onClose(() => this.windows.delete(window));
    return window;
  }

  create<T extends ManagedNativeWindow>(factory: () => T): T {
    const window = factory();
    try {
      return this.register(window);
    } catch (error) {
      window.close();
      throw error;
    }
  }

  setAlwaysOnTop(enabled: boolean): void {
    if (typeof enabled !== "boolean") {
      throw new TypeError("Studio always-on-top must be a boolean");
    }
    if (enabled === this.pinned) return;

    const changed: ManagedNativeWindow[] = [];
    try {
      for (const window of this.windows) {
        this.apply(window, enabled);
        changed.push(window);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const window of changed.reverse()) {
        try {
          this.apply(window, this.pinned);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Studio could not apply or roll back always-on-top across its windows",
        );
      }
      throw error;
    }
    this.pinned = enabled;
  }

  private apply(window: ManagedNativeWindow, enabled: boolean): void {
    if (typeof window.setAlwaysOnTop !== "function") {
      throw new Error(
        "Studio always-on-top is unavailable in the installed Bunium runtime",
      );
    }
    window.setAlwaysOnTop(enabled);
  }
}

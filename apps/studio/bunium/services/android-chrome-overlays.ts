import type { LaunchMode } from "../../src/contracts/entities";
import type { GuestRect, ToolbarSide } from "../../src/contracts/simulator";
import type { AndroidChromeCommand } from "../../src/contracts/simulator-rpc";
import { parseSimulatorRequest } from "../../src/contracts/simulator-rpc";

export type AndroidChromeSurface = "mini-app" | "telegram" | "tasks";
export type AndroidChromeRegion = "status" | "navigation" | "background";

export const ANDROID_STATUS_AREA_HEIGHT = 48;
export const ANDROID_NAVIGATION_AREA_HEIGHT = 40;

export interface AndroidChromeOverlayBounds {
  status: GuestRect;
  navigation: GuestRect;
  background: GuestRect;
}

export function androidChromeOverlayBounds(
  guest: GuestRect,
): AndroidChromeOverlayBounds {
  const values = [guest.x, guest.y, guest.width, guest.height];
  if (
    !values.every(Number.isSafeInteger) ||
    guest.x < 0 ||
    guest.y < 0 ||
    guest.width < 1 ||
    guest.height <= ANDROID_STATUS_AREA_HEIGHT + ANDROID_NAVIGATION_AREA_HEIGHT
  ) {
    throw new RangeError("invalid Android chrome guest bounds");
  }
  const statusHeight = ANDROID_STATUS_AREA_HEIGHT;
  const navigationHeight = ANDROID_NAVIGATION_AREA_HEIGHT;
  return {
    status: {
      x: guest.x,
      y: guest.y,
      width: guest.width,
      height: statusHeight,
    },
    navigation: {
      x: guest.x,
      y: guest.y + guest.height - navigationHeight,
      width: guest.width,
      height: navigationHeight,
    },
    background: {
      x: guest.x,
      y: guest.y + statusHeight,
      width: guest.width,
      height: guest.height - statusHeight - navigationHeight,
    },
  };
}

interface NativeOverlay {
  on(name: string, listener: (payload: unknown) => void): void;
  emit(name: string, payload: unknown): void;
  setBounds(bounds: GuestRect): void;
  dispose(): void;
}

export interface AndroidOverlayHost {
  createOverlay(options: {
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): NativeOverlay;
}

export interface AndroidChromeOverlayState {
  locale: string;
  mode: LaunchMode;
  side: ToolbarSide;
  surface: AndroidChromeSurface;
  theme: "light" | "dark";
}

/** Owns tightly bounded trusted CEF surfaces for Android status/nav chrome. */
export class AndroidChromeOverlays {
  private readonly status: NativeOverlay;
  private readonly navigation: NativeOverlay;
  private background: NativeOverlay | undefined;
  private currentBounds: AndroidChromeOverlayBounds;
  private state: AndroidChromeOverlayState;
  private disposed = false;

  constructor(
    private readonly host: AndroidOverlayHost,
    private readonly options: {
      origin: string;
      guestBounds: GuestRect;
      locale: string;
      mode: LaunchMode;
      side: ToolbarSide;
      theme: "light" | "dark";
      onCommand(command: AndroidChromeCommand, requestId: string): void;
    },
  ) {
    this.state = {
      locale: options.locale,
      mode: options.mode,
      side: options.side,
      surface: "mini-app",
      theme: options.theme,
    };
    this.currentBounds = androidChromeOverlayBounds(options.guestBounds);
    let status: NativeOverlay | undefined;
    let navigation: NativeOverlay | undefined;
    try {
      status = this.createRegion("status", this.currentBounds.status);
      navigation = this.createRegion(
        "navigation",
        this.currentBounds.navigation,
      );
    } catch (error) {
      status?.dispose();
      navigation?.dispose();
      throw error;
    }
    this.status = status;
    this.navigation = navigation;
  }

  setGuestBounds(bounds: GuestRect): boolean {
    this.assertActive();
    let next: AndroidChromeOverlayBounds;
    try {
      next = androidChromeOverlayBounds(bounds);
    } catch (error) {
      if (error instanceof RangeError) return false;
      throw error;
    }
    this.currentBounds = next;
    this.status.setBounds(this.currentBounds.status);
    this.navigation.setBounds(this.currentBounds.navigation);
    this.background?.setBounds(this.currentBounds.background);
    this.publishState();
    return true;
  }

  setSide(side: ToolbarSide): void {
    if (this.disposed) return;
    this.state = { ...this.state, side };
    this.publishState();
  }

  setMode(mode: LaunchMode): void {
    if (this.disposed) return;
    this.state = { ...this.state, mode };
    this.publishState();
  }

  setTheme(theme: "light" | "dark"): void {
    if (this.disposed) return;
    this.state = { ...this.state, theme };
    this.publishState();
  }

  setSurface(surface: AndroidChromeSurface): void {
    this.assertActive();
    this.state = { ...this.state, surface };
    if (surface === "mini-app") {
      const retiring = this.background;
      if (retiring) {
        setTimeout(() => {
          if (
            this.disposed ||
            this.state.surface !== "mini-app" ||
            this.background !== retiring
          ) {
            return;
          }
          retiring.dispose();
          this.background = undefined;
        }, 0);
      }
    } else if (!this.background) {
      this.background = this.createRegion(
        "background",
        this.currentBounds.background,
      );
    }
    this.publishState();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.background?.dispose();
    this.navigation.dispose();
    this.status.dispose();
    this.background = undefined;
  }

  private createRegion(
    region: AndroidChromeRegion,
    bounds: GuestRect,
  ): NativeOverlay {
    const query = new URLSearchParams({
      scene: "android-chrome-overlay",
      region,
      locale: this.state.locale,
      mode: this.state.mode,
      side: this.state.side,
      surface: this.state.surface,
      theme: this.state.theme,
    });
    const overlay = this.host.createOverlay({
      url: `${this.options.origin}/?${query}`,
      ...bounds,
    });
    overlay.on("simulator.chrome.ready", () => {
      if (!this.disposed) this.publishOverlay(overlay);
    });
    overlay.on("simulator.request", (payload) => {
      if (this.disposed) return;
      const request = parseSimulatorRequest(payload);
      if (!request || !isAndroidChromeCommand(request.command)) return;
      this.options.onCommand(request.command, request.requestId);
    });
    return overlay;
  }

  private publishState(): void {
    this.publishOverlay(this.status);
    this.publishOverlay(this.navigation);
    if (this.background) this.publishOverlay(this.background);
  }

  private publishOverlay(overlay: NativeOverlay): void {
    overlay.emit("simulator.chrome.state", this.state);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Android chrome overlays are disposed");
  }
}

function isAndroidChromeCommand(command: {
  method: string;
}): command is AndroidChromeCommand {
  return (
    command.method === "android-back" ||
    command.method === "android-home" ||
    command.method === "android-tasks" ||
    command.method === "android-resume"
  );
}

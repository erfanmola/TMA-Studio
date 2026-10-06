import type { LaunchMode } from "../../src/contracts/entities";
import type { ToolbarSide } from "../../src/contracts/simulator";
import {
  CoreProtocolEngine,
  type CoreProtocolState,
} from "../../src/domain/protocol/lifecycle";
import type { GuestBounds, GuestHandle } from "../runtime/guest";

/** State adapter for one native guest. UI changes mutate this session and never recreate its guest. */
export class SimulatorController {
  private side: ToolbarSide = "top";
  private disposed = false;
  private currentTheme: "light" | "dark";
  private readonly protocol: CoreProtocolEngine;
  private readonly unsubscribeGuest: () => void;

  constructor(
    readonly guest: GuestHandle,
    initial: CoreProtocolState,
  ) {
    this.protocol = new CoreProtocolEngine(initial, guest);
    this.currentTheme = initial.theme.scheme;
    this.unsubscribeGuest = guest.onLifecycle((event) => {
      this.protocol.setNavigationGeneration(event.navigationGeneration);
      switch (event.lifecycle) {
        case "ready":
        case "background":
          this.protocol.setLifecycle("ready");
          if (event.lifecycle === "ready")
            this.protocol.setTheme(this.currentTheme);
          break;
        case "crashed":
          this.protocol.setLifecycle("crashed");
          break;
        case "closing":
          this.protocol.setLifecycle("closing");
          break;
        default:
          this.protocol.setLifecycle("loading");
      }
    });
  }

  get toolbarSide(): ToolbarSide {
    return this.side;
  }

  get state(): CoreProtocolState {
    return this.protocol.state;
  }

  setBounds(bounds: GuestBounds): void {
    if (!this.disposed) this.guest.setBounds(bounds);
  }

  setToolbarSide(side: ToolbarSide, bounds?: GuestBounds): void {
    if (this.disposed) return;
    this.side = side;
    if (bounds) this.guest.setBounds(bounds);
  }

  setMode(mode: LaunchMode): void {
    if (!this.disposed) this.protocol.setMode(mode);
  }

  setTheme(theme: "light" | "dark"): void {
    if (this.disposed) return;
    this.currentTheme = theme;
    this.protocol.setTheme(theme);
  }

  setVisibility(visible: boolean): boolean {
    return !this.disposed && this.protocol.setVisibility(visible);
  }

  pressBackButton(): boolean {
    return !this.disposed && this.protocol.pressBackButton();
  }

  subscribe(listener: (state: CoreProtocolState) => void): () => void {
    return this.protocol.subscribe(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.protocol.dispose();
    this.unsubscribeGuest();
    this.guest.dispose();
  }
}

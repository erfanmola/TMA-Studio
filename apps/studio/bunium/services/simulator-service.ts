import type { LaunchMode, Platform } from "../../src/contracts/entities";
import type { ToolbarSide } from "../../src/contracts/simulator";
import { createCoreProtocolState } from "../../src/domain/protocol/lifecycle";
import { createNativeDocumentStartBridge } from "../../src/domain/protocol/transport";
import {
  createGuest,
  type GuestBounds,
  GuestError,
  type GuestGeolocation,
  type GuestHandle,
  type GuestHost,
} from "../runtime/guest";
import type { SessionAdapter, SessionRuntime } from "../runtime/session";
import { SimulatorController } from "./simulator-controller";

export interface PreparedSimulatorLaunch {
  /** Kept host-side. This value must never be included in a renderer reply. */
  url: string;
  close(): Promise<void>;
}

export interface SimulatorGuestRuntime extends SessionRuntime {
  guestApiVersion?: number;
}

export interface SimulatorOpenOptions {
  bounds: GuestBounds;
  guestHost: GuestHost;
  launch: PreparedSimulatorLaunch;
  mode: LaunchMode;
  partitionId: string;
  platform: Platform;
  simulatorId: string;
  toolbarSide: ToolbarSide;
  theme?: "light" | "dark";
}

type ActiveSimulator = {
  controller: SimulatorController;
  launch: PreparedSimulatorLaunch;
  unsubscribeState: () => void;
};

/** Host-only owner for guest and webview lifetimes. IDs and partitions originate in host storage. */
export class HostSimulatorService {
  private readonly active = new Map<string, ActiveSimulator>();

  constructor(
    private readonly runtime: SimulatorGuestRuntime,
    private readonly sessions: SessionAdapter,
    private readonly onGuestCloseRequested?: (simulatorId: string) => void,
  ) {}

  async open(options: SimulatorOpenOptions): Promise<SimulatorController> {
    if (
      this.runtime.guestApiVersion !== 1 ||
      this.runtime.sessionApiVersion !== 1
    ) {
      await options.launch.close();
      throw new GuestError("runtime-unsupported");
    }
    if (this.active.has(options.simulatorId)) {
      await options.launch.close();
      throw new Error("Simulator session already exists.");
    }
    let guest: GuestHandle;
    try {
      guest = createGuest(this.runtime, options.guestHost, this.sessions, {
        bounds: options.bounds,
        documentStartBridge: createNativeDocumentStartBridge(),
        entryUrl: options.launch.url,
        partitionId: options.partitionId,
        simulatorId: options.simulatorId,
        trust: "telegram-guest",
      });
    } catch (error) {
      await options.launch.close().catch(() => undefined);
      throw error;
    }
    let controller: SimulatorController;
    try {
      controller = new SimulatorController(
        guest,
        createCoreProtocolState({
          guestMountId: options.simulatorId,
          height: options.bounds.height,
          navigationGeneration: guest.navigationGeneration,
          profile: options.platform,
          mode: options.mode,
          theme: options.theme ?? "light",
          width: options.bounds.width,
        }),
      );
    } catch (error) {
      guest.dispose();
      await options.launch.close().catch(() => undefined);
      throw error;
    }
    controller.setToolbarSide(options.toolbarSide);
    const unsubscribeState = controller.subscribe((state) => {
      if (state.closeRequested)
        this.onGuestCloseRequested?.(options.simulatorId);
    });
    this.active.set(options.simulatorId, {
      controller,
      launch: options.launch,
      unsubscribeState,
    });
    return controller;
  }

  get(simulatorId: string): SimulatorController | undefined {
    return this.active.get(simulatorId)?.controller;
  }

  /** Applies mock coordinates only to the host-owned Guest for this simulator. */
  setGeolocationOverride(
    simulatorId: string,
    location: GuestGeolocation,
  ): boolean {
    const active = this.active.get(simulatorId);
    if (!active) return false;
    active.controller.guest.setGeolocationOverride(location);
    return true;
  }

  /** Clears mock coordinates only from the host-owned Guest for this simulator. */
  clearGeolocationOverride(simulatorId: string): boolean {
    const active = this.active.get(simulatorId);
    if (!active) return false;
    active.controller.guest.clearGeolocationOverride();
    return true;
  }

  async close(simulatorId: string): Promise<boolean> {
    const active = this.active.get(simulatorId);
    if (!active) return false;
    this.active.delete(simulatorId);
    active.unsubscribeState();
    active.controller.dispose();
    await active.launch.close();
    return true;
  }

  async closeAll(): Promise<void> {
    const ids = [...this.active.keys()];
    const results = await Promise.allSettled(ids.map((id) => this.close(id)));
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}

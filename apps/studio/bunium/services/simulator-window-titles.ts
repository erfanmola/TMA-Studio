/** Assigns unique native titles while a simulator window is alive. */
export class SimulatorWindowTitles {
  private readonly titles = new Map<string, string>();
  private nextNumber = 1;

  open(simulatorId: string): string {
    if (!simulatorId) throw new TypeError("Simulator ID is required.");
    const current = this.titles.get(simulatorId);
    if (current) return current;
    const title = `TMA Studio — Simulator ${this.nextNumber++}`;
    this.titles.set(simulatorId, title);
    return title;
  }

  close(simulatorId: string): void {
    this.titles.delete(simulatorId);
  }
}

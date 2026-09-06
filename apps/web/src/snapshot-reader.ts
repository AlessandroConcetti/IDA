export type SnapshotState<T> = { phase: "idle" | "loading" | "unavailable" } | { phase: "ready"; data: T };

// Une seule lecture à la fois, une relance regroupée, aucun cache persistant.
export class SnapshotReader<T> {
  private state: SnapshotState<T> = { phase: "idle" };
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private active = false;
  private reading = false;
  private queued = false;

  constructor(private readonly load: () => Promise<T>) {}

  getSnapshot = (): SnapshotState<T> => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  connect = (): (() => void) => {
    this.active = true;
    this.refresh();
    return () => {
      this.active = false;
      this.revision += 1;
      this.queued = false;
      this.setState({ phase: "idle" });
    };
  };

  refresh = (): void => {
    if (!this.active) return;
    this.revision += 1;
    this.queued = true;
    this.setState({ phase: "loading" });
    void this.drain();
  };

  private setState(state: SnapshotState<T>): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private async drain(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      while (this.active && this.queued) {
        this.queued = false;
        const revision = this.revision;
        try {
          const data = await this.load();
          if (this.active && revision === this.revision) this.setState({ phase: "ready", data });
        } catch {
          if (this.active && revision === this.revision) this.setState({ phase: "unavailable" });
        }
      }
    } finally {
      this.reading = false;
    }
  }
}

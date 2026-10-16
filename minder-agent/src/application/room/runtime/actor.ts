import type { Room } from "@domain/index.js";
import type {
  RoomJournalEvent,
  RoomJournalPort,
} from "@application/shared/ports/index.js";
import type { RoomRun } from "./room.js";

export type RoomAdmission =
  | { readonly kind: "admitted"; readonly disposition: "started" | "queued" }
  | { readonly kind: "closed" | "full"; readonly reason: string };

export interface RoomActorSnapshot {
  readonly activeRunIds: readonly string[];
  readonly queuedRunIds: readonly string[];
  readonly closed: boolean;
}

export interface RoomActor {
  enqueue(run: RoomRun): Promise<RoomAdmission>;
  refresh(room: Room): Promise<void>;
  interrupt(runId: string): Promise<void>;
  close(): Promise<void>;
  snapshot(): RoomActorSnapshot;
  drain(): Promise<void>;
}

export interface RoomActorOptions {
  readonly room: Room;
  readonly journal: RoomJournalPort;
  readonly onStarted?: (run: RoomRun) => Promise<void>;
  readonly run: (run: RoomRun) => Promise<void>;
  readonly onFinished?: (
    run: RoomRun,
    status: "completed" | "failed",
  ) => Promise<void>;
  readonly interrupt?: (runId: string) => Promise<void>;
  readonly broadcast?: (event: RoomJournalEvent) => Promise<void>;
}

/** A single-process actor; HTTP and scheduler callers only submit work. */
export function createRoomActor(options: RoomActorOptions): RoomActor {
  return new InMemoryRoomActor(options);
}

class InMemoryRoomActor implements RoomActor {
  private readonly active = new Map<string, Promise<void>>();
  private readonly queue: RoomRun[] = [];
  private closed = false;
  private room: Room;

  constructor(private readonly options: RoomActorOptions) {
    if (options.room.maxConcurrentRuns < 1)
      throw new Error("Room maxConcurrentRuns must be at least one.");
    this.room = options.room;
  }

  async enqueue(run: RoomRun): Promise<RoomAdmission> {
    if (this.closed || this.room.status !== "open")
      return { kind: "closed", reason: "Room is closed." };
    if (this.active.size < this.room.maxConcurrentRuns) {
      this.start(run);
      return { kind: "admitted", disposition: "started" };
    }
    if (this.queue.length >= this.options.room.maxQueued)
      return { kind: "full", reason: "Room queue is full." };
    this.queue.push(run);
    await this.emit("run_queued", run.runId);
    return { kind: "admitted", disposition: "queued" };
  }

  refresh(room: Room): Promise<void> {
    if (room.id !== this.room.id)
      throw new Error("Room actor identity mismatch.");
    if (room.maxConcurrentRuns < 1)
      throw new Error("Room maxConcurrentRuns must be at least one.");
    this.room = room;
    this.pump();
    return Promise.resolve();
  }

  async interrupt(runId: string): Promise<void> {
    const queuedIndex = this.queue.findIndex(
      (run) => (run.runId as string) === runId,
    );
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1);
      await this.emit("run_interrupted", runId);
      return;
    }
    if (!this.active.has(runId)) return;
    await this.options.interrupt?.(runId);
    await this.emit("run_interrupted", runId);
  }

  async close(): Promise<void> {
    this.closed = true;
    const queued = this.queue.splice(0);
    for (const run of queued) {
      await this.emit("run_interrupted", run.runId);
      await this.options.onFinished?.(run, "failed");
    }
    for (const runId of this.active.keys()) {
      await this.options.interrupt?.(runId);
      await this.emit("run_interrupted", runId);
    }
  }

  snapshot(): RoomActorSnapshot {
    return {
      activeRunIds: [...this.active.keys()],
      queuedRunIds: this.queue.map((run) => run.runId as string),
      closed: this.closed,
    };
  }

  async drain(): Promise<void> {
    while (this.active.size > 0 || this.queue.length > 0) {
      if (this.active.size === 0) {
        this.pump();
        continue;
      }
      await Promise.allSettled([...this.active.values()]);
    }
  }

  private start(run: RoomRun): void {
    const completion = this.execute(run).finally(() => {
      if (this.active.get(run.runId) === completion)
        this.active.delete(run.runId);
      this.pump();
    });
    this.active.set(run.runId, completion);
  }

  private async execute(run: RoomRun): Promise<void> {
    let status: "completed" | "failed" = "failed";
    try {
      await this.options.onStarted?.(run);
      await this.emit("run_started", run.runId);
      await this.options.run(run);
      await this.emit("run_completed", run.runId);
      status = "completed";
    } catch (error) {
      await this.emit(
        "run_failed",
        run.runId,
        error instanceof Error ? error.message : "Room run failed.",
      );
    } finally {
      await this.options.onFinished?.(run, status);
    }
  }

  private pump(): void {
    while (
      !this.closed &&
      this.active.size < this.room.maxConcurrentRuns &&
      this.queue.length > 0
    ) {
      const next = this.queue.shift();
      if (next) this.start(next);
    }
  }

  private async emit(
    type: string,
    runId: string,
    error?: string,
  ): Promise<void> {
    const payload =
      error === undefined ? { type, runId } : { type, runId, error };
    const event = await this.options.journal.append(this.room.id, payload);
    await this.options.broadcast?.(event);
  }
}

import type { Room, RoomId } from "@domain/index.js";
import type { RoomJournalPort } from "@application/shared/ports/index.js";
import { createRoomActor, type RoomActor } from "../runtime/actor.js";
import type { RoomRun } from "../runtime/room.js";

/**
 * Durable store of queued room work. Queued runs survive process restarts so
 * recovery can rehydrate a room's actor with the work it had accepted.
 */
export interface RoomQueueStore {
  saveQueued(roomId: RoomId, run: RoomRun): Promise<void>;
  loadQueued(roomId: RoomId): Promise<readonly RoomRun[]>;
  markStarted(roomId: RoomId, runId: string): Promise<void>;
  markFinished(
    roomId: RoomId,
    runId: string,
    status: "completed" | "failed",
  ): Promise<void>;
}

export interface RoomRecoveryOptions {
  readonly queueStore: RoomQueueStore;
  readonly journal: RoomJournalPort;
  readonly loadRoom: (roomId: RoomId) => Promise<Room | undefined>;
  readonly onStarted?: (run: RoomRun) => Promise<void>;
  readonly onFinished?: (
    run: RoomRun,
    status: "completed" | "failed",
  ) => Promise<void>;
  readonly run: (run: RoomRun) => Promise<void>;
  readonly interrupt?: (runId: string) => Promise<void>;
  readonly broadcast?: Parameters<typeof createRoomActor>[0]["broadcast"];
}

export interface RoomRecovery extends RoomRecoveryPort {
  rehydrate(roomId: RoomId): Promise<RoomActor>;
}

export interface RoomRecoveryPort {
  rehydrate(roomId: RoomId): Promise<RoomActor>;
  interruptCascade(runId: string): Promise<void>;
}

/**
 * Create a room recovery coordinator. {@link RoomRecovery.rehydrate} loads a
 * room and re-enqueues its durably queued runs into a fresh actor, preserving
 * admission order. Unrecoverable work is interrupted with a durable journal
 * record via {@link RoomRecovery.interruptCascade}.
 */
export function createRoomRecovery(options: RoomRecoveryOptions): RoomRecovery {
  return {
    async rehydrate(roomId) {
      const room = await options.loadRoom(roomId);
      if (!room) throw new Error("room_not_found");
      const actor = createRoomActor({
        room,
        journal: options.journal,
        ...(options.onStarted === undefined
          ? {}
          : { onStarted: options.onStarted }),
        run: options.run,
        ...(options.onFinished === undefined
          ? {}
          : { onFinished: options.onFinished }),
        ...(options.interrupt ? { interrupt: options.interrupt } : {}),
        ...(options.broadcast ? { broadcast: options.broadcast } : {}),
      });
      for (const queued of await options.queueStore.loadQueued(roomId)) {
        await actor.enqueue(queued);
      }
      return actor;
    },
    async interruptCascade(runId) {
      // Append a durable interruption so an unrecoverable run is never silently
      // dropped. The room id is unknown here for a bare cascade, so callers
      // record against the run's own identity space.
      await options.journal.append(runId as unknown as RoomId, {
        type: "run_interrupted",
        runId,
      });
      await options.interrupt?.(runId);
    },
  };
}

/** In-memory {@link RoomQueueStore} for tests and single-process defaults. */
export function createMemoryRoomQueueStore(): RoomQueueStore {
  const queued = new Map<string, RoomRun[]>();
  return {
    async saveQueued(roomId, run) {
      const current = queued.get(roomId) ?? [];
      queued.set(roomId, [...current, run]);
      await Promise.resolve();
    },
    async loadQueued(roomId) {
      await Promise.resolve();
      return queued.get(roomId) ?? [];
    },
    async markStarted(roomId, runId) {
      const current = queued.get(roomId) ?? [];
      queued.set(
        roomId,
        current.filter((run) => (run.runId as string) !== runId),
      );
      await Promise.resolve();
    },
    async markFinished() {
      await Promise.resolve();
    },
  };
}

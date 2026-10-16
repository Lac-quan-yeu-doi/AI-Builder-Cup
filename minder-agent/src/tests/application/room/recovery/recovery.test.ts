import type { Room } from "@domain/index.js";
import type {
  RoomJournalEvent,
  RoomJournalPort,
} from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  createRoomRecovery,
  createMemoryRoomQueueStore,
  type RoomRun,
} from "@application/room";

const room: Room = {
  id: "room-1" as never,
  name: "Engineering",
  maxConcurrentRuns: 1,
  maxQueued: 8,
  status: "open",
  owner: "alice" as never,
};

function run(id: string): RoomRun {
  return { runId: id as never, room, depth: 0 };
}

function journal(): RoomJournalPort & { events: RoomJournalEvent[] } {
  const events: RoomJournalEvent[] = [];
  return {
    events,
    async append(roomId, payload) {
      const event = { roomId, seq: events.length + 1, payload };
      events.push(event);
      return event;
    },
    async readFrom(roomId, afterSeq, limit) {
      return events
        .filter((event) => event.roomId === roomId && event.seq > afterSeq)
        .slice(0, limit);
    },
  };
}

describe("room recovery", () => {
  it("rehydrates queued work and replays room events by sequence", async () => {
    const store = createMemoryRoomQueueStore();
    const events = journal();
    await store.saveQueued(room.id, run("run-1"));

    const started: string[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const recovery = createRoomRecovery({
      queueStore: store,
      journal: events,
      loadRoom: async () => room,
      run: async (next) => {
        started.push(next.runId);
        await blocked;
      },
    });

    const actor = await recovery.rehydrate(room.id);
    // The rehydrated run is admitted (started, since capacity is free).
    expect([
      ...actor.snapshot().activeRunIds,
      ...actor.snapshot().queuedRunIds,
    ]).toEqual(["run-1"]);

    release();
    await actor.drain();
    expect(started).toEqual(["run-1"]);

    const replayed = await events.readFrom(room.id, 0, 100);
    expect(replayed).toEqual(
      expect.arrayContaining([expect.objectContaining({ seq: 1 })]),
    );
  });

  it("rehydrates multiple queued runs in persisted order", async () => {
    const store = createMemoryRoomQueueStore();
    const events = journal();
    await store.saveQueued(room.id, run("run-1"));
    await store.saveQueued(room.id, run("run-2"));

    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const recovery = createRoomRecovery({
      queueStore: store,
      journal: events,
      loadRoom: async () => room,
      run: async (next) => {
        if (next.runId === "run-1") await blocked;
      },
    });

    const actor = await recovery.rehydrate(room.id);
    expect(actor.snapshot().activeRunIds).toEqual(["run-1"]);
    expect(actor.snapshot().queuedRunIds).toEqual(["run-2"]);
    release();
    await actor.drain();
  });

  it("interrupts descendants of an unrecoverable run", async () => {
    const store = createMemoryRoomQueueStore();
    const events = journal();
    const recovery = createRoomRecovery({
      queueStore: store,
      journal: events,
      loadRoom: async () => room,
      run: async () => {},
    });
    await recovery.interruptCascade("run-x");
    // A durable interruption is appended even when there is nothing to run.
    expect(
      events.events.some(
        (event) =>
          (event.payload as { type?: string }).type === "run_interrupted",
      ),
    ).toBe(true);
  });
});

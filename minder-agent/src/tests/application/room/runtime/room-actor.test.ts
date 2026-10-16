import type { Room } from "@domain/index.js";
import type {
  RoomJournalEvent,
  RoomJournalPort,
} from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import { createRoomActor, type RoomRun } from "@application/room";

const room: Room = {
  id: "room-1" as never,
  name: "Engineering",
  maxConcurrentRuns: 1,
  maxQueued: 1,
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

describe("room actor", () => {
  it("starts within its concurrency cap, queues one run, and rejects overflow", async () => {
    const events = journal();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: string[] = [];
    const actor = createRoomActor({
      room,
      journal: events,
      async run(next) {
        started.push(next.runId);
        await blocked;
      },
    });

    await expect(actor.enqueue(run("one"))).resolves.toEqual({
      kind: "admitted",
      disposition: "started",
    });
    await expect(actor.enqueue(run("two"))).resolves.toEqual({
      kind: "admitted",
      disposition: "queued",
    });
    await expect(actor.enqueue(run("three"))).resolves.toEqual({
      kind: "full",
      reason: "Room queue is full.",
    });
    expect(actor.snapshot()).toEqual({
      activeRunIds: ["one"],
      queuedRunIds: ["two"],
      closed: false,
    });
    expect(started).toEqual(["one"]);

    release();
    await actor.drain();
    expect(started).toEqual(["one", "two"]);
    expect(actor.snapshot()).toEqual({
      activeRunIds: [],
      queuedRunIds: [],
      closed: false,
    });
  });

  it("journals each lifecycle event before broadcasting it with dense sequence numbers", async () => {
    const events = journal();
    const observed: RoomJournalEvent[] = [];
    const actor = createRoomActor({
      room,
      journal: events,
      async run() {},
      async broadcast(event) {
        expect(events.events).toContainEqual(event);
        observed.push(event);
      },
    });

    await actor.enqueue(run("one"));
    await actor.drain();

    expect(observed.map((event) => event.seq)).toEqual([1, 2]);
    expect(
      observed.map((event) => (event.payload as { type: string }).type),
    ).toEqual(["run_started", "run_completed"]);
    await expect(events.readFrom(room.id, 1, 10)).resolves.toEqual([
      observed[1],
    ]);
  });

  it("runs durable lifecycle hooks around the actual execution", async () => {
    const events = journal();
    const lifecycle: string[] = [];
    const actor = createRoomActor({
      room,
      journal: events,
      async onStarted(next) {
        lifecycle.push(`started:${next.runId}`);
      },
      async run(next) {
        lifecycle.push(`run:${next.runId}`);
      },
      async onFinished(next, status) {
        lifecycle.push(`${status}:${next.runId}`);
      },
    });

    await actor.enqueue(run("hooked"));
    await actor.drain();

    expect(lifecycle).toEqual([
      "started:hooked",
      "run:hooked",
      "completed:hooked",
    ]);
  });

  it("refreshes concurrency limits for an already activated room", async () => {
    const events = journal();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: string[] = [];
    const actor = createRoomActor({
      room,
      journal: events,
      async run(next) {
        started.push(next.runId);
        if (next.runId === "one") await blocked;
      },
    });

    await actor.enqueue(run("one"));
    await actor.enqueue(run("two"));
    await actor.refresh({ ...room, maxConcurrentRuns: 2 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["one", "two"]);
    release();
    await actor.drain();
  });
});

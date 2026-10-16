import type {
  RoomRecord,
  RoomRepository,
} from "@application/shared/ports/index.js";
import type { RunManager } from "@application/runtime";
import { describe, expect, it } from "vitest";
import { createRoomRunCoordinator } from "@application/room/runtime/room-runtime.js";

const room: RoomRecord = {
  id: "room-1",
  owner: "alice",
  name: "Chat",
  maxConcurrentRuns: 1,
  maxQueued: 1,
  members: ["writer"],
  createdAt: "2026-09-16T00:00:00.000Z",
  status: "open",
};

function repository(): RoomRepository {
  return {
    async create() {
      return room;
    },
    async get(owner, id) {
      return owner === room.owner && id === room.id ? room : undefined;
    },
    async getByKey() {
      return undefined;
    },
    async list() {
      return [room];
    },
    async close() {
      return room;
    },
    async addMember() {},
    async removeMember() {},
    async attachRun() {},
    async runIds() {
      return [];
    },
  };
}

describe("room run coordinator", () => {
  it("admits through the room actor and dispatches the queued runtime run", async () => {
    const calls: string[] = [];
    const runtime = {
      async admitQueued(input: {
        readonly owner: string;
        readonly input: string;
      }) {
        calls.push(`admit:${input.owner}:${input.input}`);
        return {
          kind: "started" as const,
          run: {
            id: "run-1",
            sessionId: "session-1",
            status: "queued" as const,
            mode: "interactive" as const,
            input: input.input,
            trigger: { source: "room" },
            createdAt: "2026-09-16T00:00:00.000Z",
            responseText: "",
          },
          session: {
            id: "session-1",
            key: "room:room-1:agent:writer",
            owner: input.owner,
            mode: "interactive" as const,
            history: [],
            turns: 0,
          },
        };
      },
      async dispatchQueued(runId: string, owner: string) {
        calls.push(`dispatch:${owner}:${runId}`);
        return true;
      },
      async cancelQueued() {
        return true;
      },
      async getAuthorizedRun() {
        return {
          id: "run-1",
          sessionId: "session-1",
          status: "completed" as const,
          mode: "interactive" as const,
          input: "hello",
          trigger: { source: "room" },
          createdAt: "2026-09-16T00:00:00.000Z",
          responseText: "done",
        };
      },
      async subscribe() {
        return undefined;
      },
    } as unknown as RunManager;

    const coordinator = createRoomRunCoordinator({
      runtime,
      rooms: repository(),
    });

    await expect(coordinator.activate("alice", "room-1")).resolves.toBe(true);
    const result = await coordinator.enqueue({
      owner: "alice",
      room,
      agent: "writer",
      input: "hello",
    });

    expect(result.admission.kind).toBe("started");
    expect(result.queuePosition).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["admit:alice:hello", "dispatch:alice:run-1"]);
  });

  it("keeps activation owner-scoped and idempotent", async () => {
    let reads = 0;
    const rooms = {
      ...repository(),
      async get(owner: string, id: string) {
        reads += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
        return owner === room.owner && id === room.id ? room : undefined;
      },
    } satisfies RoomRepository;
    const runtime = {
      async subscribe() {
        return undefined;
      },
    } as unknown as RunManager;
    const coordinator = createRoomRunCoordinator({ runtime, rooms });

    const [first, second, foreign] = await Promise.all([
      coordinator.activate("alice", "room-1"),
      coordinator.activate("alice", "room-1"),
      coordinator.activate("bob", "room-1"),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(foreign).toBe(false);
    expect(reads).toBe(2);
  });

  it("cancels the runtime run when room persistence fails", async () => {
    const cancelled: string[] = [];
    const runtime = {
      async admitQueued() {
        return {
          kind: "started" as const,
          run: {
            id: "run-1",
            sessionId: "session-1",
            status: "queued" as const,
            mode: "autonomous" as const,
            input: "hello",
            trigger: { source: "room-webhook" },
            createdAt: "2026-09-16T00:00:00.000Z",
            responseText: "",
          },
          session: {
            id: "session-1",
            key: "room:room-1:agent:writer",
            owner: "alice",
            mode: "autonomous" as const,
            history: [],
            turns: 0,
          },
        };
      },
      async cancelQueued(runId: string) {
        cancelled.push(runId);
        return true;
      },
    } as unknown as RunManager;
    const rooms = {
      ...repository(),
      async attachRun() {
        throw new Error("room persistence down");
      },
    } satisfies RoomRepository;
    const coordinator = createRoomRunCoordinator({ runtime, rooms });

    await expect(
      coordinator.enqueue({
        owner: "alice",
        room,
        agent: "writer",
        input: "hello",
        mode: "autonomous",
        trigger: { source: "room-webhook" },
      }),
    ).rejects.toThrow("room persistence down");
    expect(cancelled).toEqual(["run-1"]);
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomId } from "@domain/index.js";
import { PrismaRuntimeStore } from "@infrastructure/prisma/prisma-runtime-store.js";
import { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import {
  PrismaRoomJournal,
  PrismaRoomQueueStore,
  PrismaRoomRepository,
  PrismaRoomWebhookRepository,
} from "@infrastructure/prisma/repositories/index.js";

const connectionString = process.env.MINDER_TEST_DATABASE_URL;
const describeDatabase = connectionString ? describe : describe.skip;

describeDatabase("Prisma room repositories", () => {
  const schema = `prisma_test_${randomUUID().replaceAll("-", "")}`;
  process.env.MINDER_DATABASE_SCHEMA = schema;
  const prisma = new PrismaService(
    connectionString === undefined ? {} : { datasourceUrl: connectionString },
  );
  const runtime = new PrismaRuntimeStore({ prisma, schema });
  const owner = `room-repositories-${randomUUID()}`;
  let roomId: string;
  let runIds: string[];

  beforeAll(async () => {
    await prisma.$connect();
    await runtime.migrate();
    const rooms = new PrismaRoomRepository(prisma);
    const room = await rooms.create({
      owner,
      name: "Room",
      key: "room-key",
      maxConcurrentRuns: 1,
      maxQueued: 3,
      members: ["zeta", "alpha", "alpha"],
    });
    roomId = room.id;
    runIds = await Promise.all(
      ["one", "two", "three"].map(async (input) => {
        const session = await runtime.getOrCreateSession(
          owner,
          `session-${randomUUID()}`,
          "interactive",
        );
        const run = await runtime.createRun(session.id, input, "interactive", {
          source: "room-test",
        });
        return run.id;
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("preserves room ownership, member ordering, close semantics, and run links", async () => {
    const rooms = new PrismaRoomRepository(prisma);
    await Promise.all([
      rooms.create({
        owner,
        name: "Keyless one",
        maxConcurrentRuns: 1,
        maxQueued: 1,
        members: [],
      }),
      rooms.create({
        owner,
        name: "Keyless two",
        maxConcurrentRuns: 1,
        maxQueued: 1,
        members: [],
      }),
    ]);
    await expect(
      rooms.create({
        owner: "other-owner",
        name: "Same key",
        key: "room-key",
        maxConcurrentRuns: 1,
        maxQueued: 1,
        members: [],
      }),
    ).resolves.toMatchObject({ key: "room-key" });
    await expect(
      rooms.create({
        owner,
        name: "Duplicate key",
        key: "room-key",
        maxConcurrentRuns: 1,
        maxQueued: 1,
        members: [],
      }),
    ).rejects.toThrow();

    await expect(rooms.get(owner, roomId)).resolves.toMatchObject({
      id: roomId,
      owner,
      members: ["alpha", "zeta"],
      status: "open",
    });
    await expect(rooms.get("other-owner", roomId)).resolves.toBeUndefined();
    await expect(rooms.getByKey(owner, "room-key")).resolves.toMatchObject({
      id: roomId,
    });

    await rooms.addMember(owner, roomId, "beta");
    await rooms.addMember("other-owner", roomId, "intruder");
    await expect(rooms.members(owner, roomId)).resolves.toEqual([
      "alpha",
      "beta",
      "zeta",
    ]);
    await rooms.removeMember(owner, roomId, "beta");
    await expect(rooms.members(owner, roomId)).resolves.toEqual([
      "alpha",
      "zeta",
    ]);

    await rooms.attachRun(owner, roomId, runIds[0]!);
    await rooms.attachRun("other-owner", roomId, runIds[1]!);
    await expect(rooms.runIds(owner, roomId)).resolves.toEqual([runIds[0]]);

    await expect(rooms.close("other-owner", roomId)).resolves.toBeUndefined();
    await expect(rooms.close(owner, roomId)).resolves.toMatchObject({
      id: roomId,
      status: "closed",
    });
    await expect(rooms.close(owner, roomId)).resolves.toMatchObject({
      id: roomId,
      status: "closed",
    });
    expect(
      (await rooms.list(owner, false)).map((room) => room.name).sort(),
    ).toEqual(["Keyless one", "Keyless two"]);
    await expect(rooms.list(owner, true)).resolves.toHaveLength(3);
  });

  it("preserves journal sequences, queue transitions, timestamps, and webhook ownership", async () => {
    const journal = new PrismaRoomJournal(prisma);
    const first = await journal.append(roomId as RoomId, {
      type: "room.started",
    });
    const concurrent = await Promise.all([
      journal.append(roomId as RoomId, { type: "room.one" }),
      journal.append(roomId as RoomId, { type: "room.two" }),
    ]);
    expect(first.seq).toBe(1);
    expect(concurrent.map((event) => event.seq).sort()).toEqual([2, 3]);
    await expect(
      journal.readFrom(roomId as RoomId, 1, 10),
    ).resolves.toHaveLength(2);

    const queue = new PrismaRoomQueueStore(prisma);
    const createdAt = "2026-09-20T00:00:00.000Z";
    await queue.enqueue({
      owner,
      roomId,
      runId: runIds[0]!,
      payload: { input: "one" },
      position: 1,
      createdAt,
    });
    await queue.enqueue({
      owner,
      roomId,
      runId: runIds[1]!,
      payload: { input: "two" },
      position: 2,
      createdAt,
    });
    await expect(queue.listQueued(owner, roomId)).resolves.toMatchObject([
      { runId: runIds[0], state: "queued", createdAt },
      { runId: runIds[1], state: "queued", createdAt },
    ]);
    await expect(queue.markStarted(owner, roomId, runIds[0]!)).resolves.toBe(
      true,
    );
    await expect(queue.markStarted(owner, roomId, runIds[0]!)).resolves.toBe(
      false,
    );
    await expect(
      queue.complete(owner, roomId, runIds[0]!, "completed"),
    ).resolves.toBe(true);
    await expect(queue.claimNext(owner, roomId)).resolves.toMatchObject({
      runId: runIds[1],
      state: "running",
    });
    await expect(
      queue.complete("other-owner", roomId, runIds[1]!, "completed"),
    ).resolves.toBe(false);
    await expect(
      queue.complete(owner, roomId, runIds[1]!, "interrupted"),
    ).resolves.toBe(true);

    const webhooks = new PrismaRoomWebhookRepository(prisma);
    const webhook = await webhooks.create({
      owner,
      roomId,
      agent: "planner",
      source: "github",
      secretRef: "secret/github",
    });
    expect(webhook.createdAt).toMatch(/Z$/u);
    await expect(webhooks.list(owner, roomId)).resolves.toEqual([webhook]);
    await webhooks.remove("other-owner", webhook.id);
    await expect(webhooks.get(webhook.id)).resolves.toEqual(webhook);
    await webhooks.remove(owner, webhook.id);
    await expect(webhooks.get(webhook.id)).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  createMemoryRoomRepository,
  createMemoryRoomWebhookRepository,
} from "@application/room/memory.js";

describe("memory room adapters", () => {
  it("keeps room data owner-scoped", async () => {
    const rooms = createMemoryRoomRepository();
    const room = await rooms.create({
      owner: "alice",
      name: "Room",
      maxConcurrentRuns: 1,
      maxQueued: 1,
      members: [],
    });

    expect(await rooms.get("alice", room.id)).toEqual(room);
    expect(await rooms.get("bob", room.id)).toBeUndefined();
  });

  it("creates an empty webhook adapter", async () => {
    expect(
      await createMemoryRoomWebhookRepository().list("alice", "room"),
    ).toEqual([]);
  });
});

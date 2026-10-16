import type { Room, RoomId } from "@domain/index.js";
import { describe, expect, it } from "vitest";
import { createDurableRoomRegistry, type RoomActor } from "@application/room";

describe("DurableRoomRegistry", () => {
  it("coalesces concurrent activation per owner and room without sharing across owners", async () => {
    const activations: string[] = [];
    const aliceActor = {} as RoomActor;
    const bobActor = {} as RoomActor;
    const registry = createDurableRoomRegistry({
      rehydrate: async (owner, roomId) => {
        activations.push(owner + ":" + roomId);
        return owner === "alice" ? aliceActor : bobActor;
      },
    });
    const roomId = "room-1" as RoomId;

    const [first, second] = await Promise.all([
      registry.get("alice", roomId),
      registry.get("alice", roomId),
    ]);
    const otherOwner = await registry.get("bob", roomId);

    expect(first).toBe(aliceActor);
    expect(second).toBe(aliceActor);
    expect(otherOwner).toBe(bobActor);
    expect(activations).toEqual(["alice:room-1", "bob:room-1"]);
  });

  it("refreshes only the owner-scoped live actor", async () => {
    const refreshed: string[] = [];
    const actor = {
      refresh: async (room: { name: string }) => {
        refreshed.push(room.name);
      },
    } as unknown as RoomActor;
    const registry = createDurableRoomRegistry({
      rehydrate: async () => actor,
    });

    await registry.get("alice", "room-1" as RoomId);
    await expect(
      registry.refresh(
        "alice",
        "room-1" as RoomId,
        { name: "updated" } as Room,
      ),
    ).resolves.toBe(true);
    await expect(
      registry.refresh("bob", "room-1" as RoomId, { name: "ignored" } as Room),
    ).resolves.toBe(false);
    expect(refreshed).toEqual(["updated"]);
  });
});

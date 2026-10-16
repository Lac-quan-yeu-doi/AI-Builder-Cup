import type { Room, RoomId } from "@domain/index.js";
import type { RoomActor } from "./actor.js";

export interface DurableRoomRegistry {
  get(owner: string, roomId: RoomId): Promise<RoomActor | undefined>;
  refresh(owner: string, roomId: RoomId, room: Room): Promise<boolean>;
  close(owner: string, roomId: RoomId): Promise<void>;
  invalidate(owner: string, roomId: RoomId): void;
}

export interface DurableRoomRegistryOptions {
  readonly rehydrate: (
    owner: string,
    roomId: RoomId,
  ) => Promise<RoomActor | undefined>;
}

/**
 * Process-local actor handles over durable room state. Each owner/room pair
 * has at most one activation in flight, while the durable store remains the
 * source of truth for recovery after process replacement.
 */
export function createDurableRoomRegistry(
  options: DurableRoomRegistryOptions,
): DurableRoomRegistry {
  const actors = new Map<string, RoomActor>();
  const activating = new Map<string, Promise<RoomActor | undefined>>();

  const keyFor = (owner: string, roomId: RoomId): string =>
    owner + "\\u0000" + roomId;

  return {
    async get(owner, roomId) {
      const key = keyFor(owner, roomId);
      const existing = actors.get(key);
      if (existing) return existing;

      const inFlight = activating.get(key);
      if (inFlight) return inFlight;

      const activation = options
        .rehydrate(owner, roomId)
        .then((actor) => {
          if (actor) actors.set(key, actor);
          return actor;
        })
        .finally(() => {
          activating.delete(key);
        });
      activating.set(key, activation);
      return activation;
    },
    async close(owner, roomId) {
      const key = keyFor(owner, roomId);
      const actor = actors.get(key);
      if (!actor) return;
      await actor.close();
      actors.delete(key);
    },
    async refresh(owner, roomId, room) {
      const actor = actors.get(keyFor(owner, roomId));
      if (!actor) return false;
      await actor.refresh(room);
      return true;
    },
    invalidate(owner, roomId) {
      actors.delete(keyFor(owner, roomId));
    },
  };
}

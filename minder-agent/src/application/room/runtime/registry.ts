import type { RoomId } from "@domain/index.js";
import type { RoomActor } from "./actor.js";
import type { RoomRecovery } from "../recovery/recovery.js";

/**
 * A registry of live room actors, one bounded actor per room. Actors are
 * created lazily via recovery so a restarted process rehydrates durable queued
 * work on first access.
 */
export interface RoomRegistry {
  get(roomId: RoomId): Promise<RoomActor | undefined>;
}

export interface RoomRegistryOptions {
  readonly recovery: RoomRecovery;
}

export function createRoomRegistry(options: RoomRegistryOptions): RoomRegistry {
  const actors = new Map<string, RoomActor>();
  return {
    async get(roomId) {
      const existing = actors.get(roomId);
      if (existing) return existing;
      try {
        const actor = await options.recovery.rehydrate(roomId);
        actors.set(roomId, actor);
        return actor;
      } catch {
        // A missing room is indistinguishable from a foreign one.
        return undefined;
      }
    },
  };
}

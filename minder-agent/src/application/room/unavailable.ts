import { FeatureNotImplementedError } from "@application/shared/ports/index.js";
import type { RoomActor } from "./runtime/actor.js";
export const createUnavailableRoomActor = (): RoomActor => ({
  refresh: () => Promise.reject(new FeatureNotImplementedError("room-actor")),
  enqueue: () => Promise.reject(new FeatureNotImplementedError("room-actor")),
  interrupt: () => Promise.reject(new FeatureNotImplementedError("room-actor")),
  close: () => Promise.reject(new FeatureNotImplementedError("room-actor")),
  snapshot() {
    return { activeRunIds: [], queuedRunIds: [], closed: true };
  },
  drain: () => Promise.reject(new FeatureNotImplementedError("room-actor")),
});

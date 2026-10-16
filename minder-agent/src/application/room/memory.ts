import { randomUUID } from "node:crypto";
import type {
  RoomRecord,
  RoomRepository,
  RoomWebhookRecord,
  RoomWebhookRepository,
} from "@application/shared/ports/index.js";

export function createMemoryRoomRepository(): RoomRepository {
  const rooms = new Map<string, RoomRecord>();
  const roomRuns = new Map<string, string[]>();
  return {
    create(input) {
      const room: RoomRecord = {
        id: randomUUID(),
        ...input,
        status: "open",
        createdAt: new Date().toISOString(),
      };
      rooms.set(room.id, room);
      return Promise.resolve(room);
    },
    get(owner, id) {
      const room = rooms.get(id);
      return Promise.resolve(room?.owner === owner ? room : undefined);
    },
    getByKey(owner, key) {
      return Promise.resolve(
        [...rooms.values()].find(
          (room) => room.owner === owner && room.key === key,
        ),
      );
    },
    list(owner, includeClosed) {
      return Promise.resolve(
        [...rooms.values()]
          .filter(
            (room) =>
              room.owner === owner && (includeClosed || room.status === "open"),
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      );
    },
    close(owner, id) {
      const room = rooms.get(id);
      if (!room || room.owner !== owner) return Promise.resolve(undefined);
      room.status = "closed";
      return Promise.resolve(room);
    },
    addMember(owner, roomId, agent) {
      const room = rooms.get(roomId);
      if (!room || room.owner !== owner) return Promise.resolve();
      rooms.set(roomId, {
        ...room,
        members: [...new Set([...room.members, agent])].sort(),
      });
      return Promise.resolve();
    },
    removeMember(owner, roomId, agent) {
      const room = rooms.get(roomId);
      if (!room || room.owner !== owner) return Promise.resolve();
      rooms.set(roomId, {
        ...room,
        members: room.members.filter((member) => member !== agent),
      });
      return Promise.resolve();
    },
    attachRun(owner, roomId, runId) {
      const room = rooms.get(roomId);
      if (!room || room.owner !== owner) return Promise.resolve();
      const current = roomRuns.get(roomId) ?? [];
      if (!current.includes(runId)) roomRuns.set(roomId, [...current, runId]);
      return Promise.resolve();
    },
    runIds(owner, roomId) {
      const room = rooms.get(roomId);
      return Promise.resolve(
        !room || room.owner !== owner ? [] : (roomRuns.get(roomId) ?? []),
      );
    },
  };
}

export function createMemoryRoomWebhookRepository(): RoomWebhookRepository {
  const values = new Map<string, RoomWebhookRecord>();
  return {
    create(input) {
      const value: RoomWebhookRecord = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        ...input,
      };
      values.set(value.id, value);
      return Promise.resolve(value);
    },
    get(id) {
      return Promise.resolve(values.get(id));
    },
    list(owner, roomId) {
      return Promise.resolve(
        [...values.values()]
          .filter((value) => value.owner === owner && value.roomId === roomId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      );
    },
    remove(owner, id) {
      const value = values.get(id);
      if (value?.owner === owner) values.delete(id);
      return Promise.resolve();
    },
  };
}

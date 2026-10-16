import type { JsonValue, RoomId } from "@domain/index.js";
import type {
  RoomJournalEvent,
  RoomQueueItem,
  RoomQueueState,
  RoomRecord,
  RoomWebhookRecord,
} from "@application/shared/ports/index.js";
import { timestamp } from "./repositories.js";

export function roomFromRow(
  row: {
    id: string;
    owner: string;
    name: string;
    key: string | null;
    maxConcurrentRuns: number;
    maxQueued: number;
    status: string;
    createdAt: Date;
  },
  members: readonly string[],
): RoomRecord {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    ...(row.key === null ? {} : { key: row.key }),
    maxConcurrentRuns: row.maxConcurrentRuns,
    maxQueued: row.maxQueued,
    status: row.status as RoomRecord["status"],
    createdAt: timestamp(row.createdAt),
    members,
  };
}

export function roomJournalEventFromRow(
  roomId: RoomId,
  row: { seq: bigint | number; event: unknown },
): RoomJournalEvent {
  return {
    roomId,
    seq: Number(row.seq),
    payload: structuredClone(row.event) as JsonValue,
  };
}

export function roomQueueItemFromRow(
  owner: string,
  row: {
    roomId: string;
    runId: string;
    payload: unknown;
    position: number;
    state: string;
    createdAt: Date;
  },
): RoomQueueItem {
  return {
    owner,
    roomId: row.roomId,
    runId: row.runId,
    payload: structuredClone(row.payload),
    position: row.position,
    state: row.state as RoomQueueState,
    createdAt: timestamp(row.createdAt),
  };
}

export function roomWebhookFromRow(row: {
  id: string;
  owner: string;
  roomId: string;
  agentName: string;
  source: string;
  secretRef: string;
  createdAt: Date;
}): RoomWebhookRecord {
  return {
    id: row.id,
    owner: row.owner,
    roomId: row.roomId,
    agent: row.agentName,
    source: row.source,
    secretRef: row.secretRef,
    createdAt: timestamp(row.createdAt),
  };
}

import type {
  RoomRecord,
  RoomRepository,
} from "@application/shared/ports/index.js";

export async function createRoom(
  body: Record<string, unknown> | undefined,
  owner: string,
  repository: RoomRepository,
): Promise<RoomRecord | HttpRoomError> {
  const name = stringField(body, "name");
  const maxConcurrentRuns = numberField(body, "max_concurrent_runs");
  const key = optionalStringField(body, "key");
  const members = arrayOfStrings(body?.members);
  const maxQueued =
    body?.max_queued === undefined ? 256 : numberField(body, "max_queued");
  if (
    !name ||
    maxConcurrentRuns === undefined ||
    maxConcurrentRuns < 1 ||
    maxQueued === undefined ||
    maxQueued < 0 ||
    members === undefined
  )
    return new HttpRoomError(
      400,
      "invalid_room",
      "Room name, cap, queue limit, and members are invalid.",
    );
  if (key && (await repository.getByKey(owner, key)))
    return new HttpRoomError(
      409,
      "room_key_conflict",
      "A room with this key already exists.",
    );
  return repository.create({
    owner,
    name,
    ...(key ? { key } : {}),
    maxConcurrentRuns,
    maxQueued,
    members,
  });
}

export function roomBody(room: RoomRecord): object {
  return {
    id: room.id,
    name: room.name,
    ...(room.key === undefined ? {} : { key: room.key }),
    max_concurrent_runs: room.maxConcurrentRuns,
    max_queued: room.maxQueued,
    status: room.status,
    members: room.members,
    created_at: room.createdAt,
  };
}

export function webhookBody(webhook: {
  readonly agent: string;
  readonly createdAt: string;
  readonly id: string;
  readonly roomId: string;
  readonly secretRef: string;
  readonly source: string;
}): object {
  return {
    agent: webhook.agent,
    created_at: webhook.createdAt,
    id: webhook.id,
    room_id: webhook.roomId,
    secret_ref: webhook.secretRef,
    source: webhook.source,
  };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function stringField(
  body: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = body?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalStringField(
  body: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return body?.[key] === undefined ? undefined : stringField(body, key);
}

function numberField(
  body: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = body?.[key];
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function arrayOfStrings(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) &&
    value.every((member) => typeof member === "string" && member.trim())
    ? value.map((member) => (member as string).trim())
    : undefined;
}

export class HttpRoomError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

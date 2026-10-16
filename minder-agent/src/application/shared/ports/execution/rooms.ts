import type { Room, RoomId } from "@domain/index.js";

export interface RoomPort {
  get(id: RoomId): Promise<Room | undefined>;
  getByKey(owner: string, key: string): Promise<Room | undefined>;
  list(owner: string): Promise<readonly Room[]>;
  save(room: Room): Promise<void>;
}

export interface RoomRecord {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly key?: string;
  readonly maxConcurrentRuns: number;
  readonly maxQueued: number;
  readonly members: readonly string[];
  readonly createdAt: string;
  status: "open" | "closed";
}

export type CreateRoomInput = Omit<RoomRecord, "id" | "status" | "createdAt">;

export interface RoomRepository {
  create(input: CreateRoomInput): Promise<RoomRecord>;
  get(owner: string, id: string): Promise<RoomRecord | undefined>;
  getByKey(owner: string, key: string): Promise<RoomRecord | undefined>;
  list(owner: string, includeClosed: boolean): Promise<readonly RoomRecord[]>;
  close(owner: string, id: string): Promise<RoomRecord | undefined>;
  addMember(owner: string, roomId: string, agent: string): Promise<void>;
  removeMember(owner: string, roomId: string, agent: string): Promise<void>;
  attachRun(owner: string, roomId: string, runId: string): Promise<void>;
  runIds(owner: string, roomId: string): Promise<readonly string[]>;
}

export interface RoomMemberRepository extends RoomRepository {
  members(owner: string, roomId: string): Promise<readonly string[]>;
}

export interface RoomWebhookRecord {
  readonly id: string;
  readonly owner: string;
  readonly roomId: string;
  readonly agent: string;
  readonly source: string;
  readonly secretRef: string;
  readonly createdAt: string;
}

export interface RoomWebhookRepository {
  create(
    input: Omit<RoomWebhookRecord, "id" | "createdAt">,
  ): Promise<RoomWebhookRecord>;
  get(id: string): Promise<RoomWebhookRecord | undefined>;
  list(owner: string, roomId: string): Promise<readonly RoomWebhookRecord[]>;
  remove(owner: string, id: string): Promise<void>;
}

export type RoomQueueState = "queued" | "running" | "completed" | "interrupted";

export interface RoomQueueItem {
  readonly owner: string;
  readonly roomId: string;
  readonly runId: string;
  readonly payload: unknown;
  readonly position: number;
  readonly createdAt: string;
  readonly state?: RoomQueueState;
}

export type RoomQueuePersistenceItem = Omit<RoomQueueItem, "state">;

export interface RoomQueuePersistence {
  enqueue(item: RoomQueuePersistenceItem): Promise<void>;
  listQueued(
    owner: string,
    roomId: string,
  ): Promise<readonly RoomQueuePersistenceItem[]>;
  markStarted(
    owner: string,
    roomId: string,
    runId: string,
  ): Promise<boolean | void>;
  markFinished(
    owner: string,
    roomId: string,
    runId: string,
    status: "completed" | "interrupted",
  ): Promise<boolean | void>;
}

export interface RoomQueueStore {
  enqueue(item: RoomQueueItem): Promise<void>;
  listQueued(owner: string, roomId: string): Promise<readonly RoomQueueItem[]>;
  markStarted(owner: string, roomId: string, runId: string): Promise<boolean>;
  markFinished(
    owner: string,
    roomId: string,
    runId: string,
    state: Extract<RoomQueueState, "completed" | "interrupted">,
  ): Promise<boolean>;
  claimNext(owner: string, roomId: string): Promise<RoomQueueItem | undefined>;
  complete(
    owner: string,
    roomId: string,
    runId: string,
    state: Extract<RoomQueueState, "completed" | "interrupted">,
  ): Promise<boolean>;
}

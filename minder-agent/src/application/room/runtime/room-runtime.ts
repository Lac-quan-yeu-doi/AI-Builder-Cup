import type {
  RunContext,
  RunManager,
  Admission,
  RuntimeRun,
} from "@application/runtime";
import { createDurableRoomRegistry } from "./durable-registry.js";
import {
  createRoomRecovery,
  type RoomQueueStore,
} from "../recovery/recovery.js";
import type { RoomRun } from "./room.js";
import type { RoomId, Room as DomainRoom } from "@domain/index.js";
import type {
  DataScope,
  RoomJournalEvent,
  RoomJournalPort,
  RoomQueuePersistence,
  RoomQueuePersistenceItem,
  RoomRecord,
  RoomRepository,
} from "@application/shared/ports/index.js";
export type {
  RoomQueuePersistence,
  RoomQueuePersistenceItem,
} from "@application/shared/ports/index.js";

export interface RoomRunRequest {
  readonly runId?: string;
  readonly requestId?: string;
  readonly owner: string;
  /** Organization-scoped owner used for manifest and MCP lookup. */
  readonly manifestOwner?: string;
  readonly room: RoomRecord;
  readonly agent: string;
  readonly input: string;
  readonly dataScope?: DataScope;
  readonly context?: RunContext;
  /** Verified caller subject for delegated MCP access. */
  readonly callerSubject?: string;
  readonly mode?: "interactive" | "autonomous";
  readonly trigger?: {
    readonly source: string;
    readonly deliveryId?: string;
  };
}

export type RoomCoordinatorAdmission =
  | {
      readonly kind: "started";
      readonly run: RuntimeRun;
      readonly session: Extract<Admission, { kind: "started" }>["session"];
    }
  | Extract<Admission, { kind: "rejected" }>
  | Extract<Admission, { kind: "duplicate_delivery" }>
  | { readonly kind: "full"; readonly runId: string; readonly reason: string };

export interface RoomCoordinatorResult {
  readonly admission: RoomCoordinatorAdmission;
  readonly queuePosition: number;
}

export interface RoomRunCoordinator {
  activate(owner: string, roomId: string): Promise<boolean>;
  refresh(owner: string, room: RoomRecord): Promise<boolean>;
  enqueue(input: RoomRunRequest): Promise<RoomCoordinatorResult>;
  close(owner: string, roomId: string): Promise<void>;
}

/**
 * Binds runtime admissions to one owner-scoped actor per room. Runtime runs
 * are created in the queued state before the actor accepts them, so the
 * durable queue is the recovery boundary rather than an in-memory promise.
 */
export function createRoomRunCoordinator(options: {
  readonly runtime: RunManager;
  readonly rooms: RoomRepository;
  readonly queue?: RoomQueuePersistence;
  readonly journal?: RoomJournalPort;
}): RoomRunCoordinator {
  const queue = options.queue ?? createMemoryQueuePersistence();
  const journal = options.journal ?? createMemoryRoomJournal();
  const registry = createDurableRoomRegistry({
    rehydrate: async (owner, roomId) => {
      const persisted = await options.rooms.get(owner, String(roomId));
      if (!persisted) return undefined;
      const room = domainRoom(persisted);
      const recovery = createRoomRecovery({
        queueStore: createQueueStore(queue, owner, persisted, room),
        journal,
        loadRoom: async () => {
          await Promise.resolve();
          return room;
        },
        onStarted: async (run) => {
          await queue.markStarted(owner, persisted.id, String(run.runId));
        },
        onFinished: async (run, status) => {
          await queue.markFinished(
            owner,
            persisted.id,
            String(run.runId),
            status === "failed" ? "interrupted" : "completed",
          );
        },
        run: async (run) => {
          if (run.input === undefined || run.agent === undefined)
            throw new Error("room_run_payload_invalid");
          const dispatched = await options.runtime.dispatchQueued(
            String(run.runId),
            owner,
          );
          if (!dispatched) throw new Error("room_run_not_dispatchable");
          await waitForRuntimeRun(options.runtime, String(run.runId), owner);
        },
      });
      return recovery.rehydrate(roomId);
    },
  });

  return {
    async activate(owner, roomId) {
      return (await registry.get(owner, roomId as RoomId)) !== undefined;
    },
    async refresh(owner, room) {
      return registry.refresh(owner, room.id as RoomId, domainRoom(room));
    },
    async enqueue(input) {
      const runtimeAdmission = await options.runtime.admitQueued({
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
        key: `room:${input.room.id}:agent:${input.agent}`,
        input: input.input,
        owner: input.owner,
        manifestName: input.agent,
        ...(input.manifestOwner === undefined
          ? {}
          : { manifestOwner: input.manifestOwner }),
        ...(input.dataScope === undefined
          ? {}
          : { dataScope: input.dataScope }),
        ...(input.context === undefined ? {} : { context: input.context }),
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        ...(input.callerSubject === undefined
          ? {}
          : {
              delegation: {
                roomId: input.room.id,
                callerSubject: input.callerSubject,
                ...(input.runId === undefined
                  ? {}
                  : { authorizationRunId: input.runId }),
              },
            }),
        mode: input.mode ?? "interactive",
        trigger: input.trigger ?? { source: "room" },
      });
      if (runtimeAdmission.kind !== "started")
        return { admission: runtimeAdmission, queuePosition: 0 };

      const actor = await registry.get(input.owner, input.room.id as RoomId);
      if (!actor) {
        await options.runtime.cancelQueued(
          runtimeAdmission.run.id,
          input.owner,
        );
        return {
          admission: {
            kind: "full",
            runId: runtimeAdmission.run.id,
            reason: "Room actor is unavailable.",
          },
          queuePosition: 0,
        };
      }

      const roomRun: RoomRun = {
        runId: runtimeAdmission.run.id as never,
        room: domainRoom(input.room),
        agent: input.agent,
        input: input.input,
        ...(input.dataScope === undefined
          ? {}
          : { dataScope: input.dataScope }),
        ...(input.context === undefined ? {} : { context: input.context }),
        depth: 0,
      };
      let persistedInQueue = false;
      let actorAdmission: Awaited<ReturnType<typeof actor.enqueue>>;
      try {
        await queue.enqueue({
          owner: input.owner,
          roomId: input.room.id,
          runId: runtimeAdmission.run.id,
          payload: queuePayload(roomRun),
          position:
            actor.snapshot().activeRunIds.length +
            actor.snapshot().queuedRunIds.length,
          createdAt: runtimeAdmission.run.createdAt,
        });
        persistedInQueue = true;
        await options.rooms.attachRun(
          input.owner,
          input.room.id,
          runtimeAdmission.run.id,
        );
        actorAdmission = await actor.enqueue(roomRun);
      } catch (error) {
        try {
          await options.runtime.cancelQueued(
            runtimeAdmission.run.id,
            input.owner,
          );
        } catch {
          // Preserve the persistence/dispatch failure for the HTTP boundary.
        }
        if (persistedInQueue) {
          try {
            await queue.markFinished(
              input.owner,
              input.room.id,
              runtimeAdmission.run.id,
              "interrupted",
            );
          } catch {
            // Best-effort cleanup; recovery can reconcile the durable row.
          }
        }
        throw error;
      }
      if (actorAdmission.kind !== "admitted") {
        await options.runtime.cancelQueued(
          runtimeAdmission.run.id,
          input.owner,
        );
        await queue.markFinished(
          input.owner,
          input.room.id,
          runtimeAdmission.run.id,
          "interrupted",
        );
        return {
          admission: {
            kind: "full",
            runId: runtimeAdmission.run.id,
            reason: actorAdmission.reason,
          },
          queuePosition: 0,
        };
      }

      return {
        admission: runtimeAdmission,
        queuePosition:
          actorAdmission.disposition === "queued"
            ? actor.snapshot().queuedRunIds.indexOf(runtimeAdmission.run.id) + 1
            : 0,
      };
    },
    async close(owner, roomId) {
      await registry.close(owner, roomId as RoomId);
    },
  };
}

function createQueueStore(
  queue: RoomQueuePersistence,
  owner: string,
  persisted: RoomRecord,
  room: DomainRoom,
): RoomQueueStore {
  return {
    async saveQueued(roomId, run) {
      const queued = await queue.listQueued(owner, persisted.id);
      await queue.enqueue({
        owner,
        roomId: String(roomId),
        runId: String(run.runId),
        payload: queuePayload(run),
        position: queued.length,
        createdAt: new Date().toISOString(),
      });
    },
    async loadQueued(roomId) {
      const items = await queue.listQueued(owner, String(roomId));
      return items.flatMap((item) => {
        const payload = roomRunPayload(item.payload);
        return payload === undefined
          ? []
          : [
              {
                runId: item.runId as never,
                room,
                ...payload,
                depth: payload.depth,
              },
            ];
      });
    },
    async markStarted(roomId, runId) {
      await queue.markStarted(owner, persisted.id, String(runId));
    },
    async markFinished(roomId, runId, status) {
      await queue.markFinished(
        owner,
        persisted.id,
        String(runId),
        status === "failed" ? "interrupted" : "completed",
      );
    },
  };
}

function domainRoom(room: RoomRecord): DomainRoom {
  return {
    id: room.id as never,
    owner: room.owner as never,
    name: room.name,
    maxConcurrentRuns: room.maxConcurrentRuns,
    maxQueued: room.maxQueued,
    status: room.status,
    ...(room.key === undefined ? {} : { key: room.key }),
  };
}

function queuePayload(run: RoomRun): object {
  return {
    ...(run.agent === undefined ? {} : { agent: run.agent }),
    ...(run.input === undefined ? {} : { input: run.input }),
    ...(run.dataScope === undefined ? {} : { dataScope: run.dataScope }),
    ...(run.context === undefined ? {} : { context: run.context }),
    ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
    depth: run.depth,
  };
}

function roomRunPayload(
  value: unknown,
):
  | Pick<
      RoomRun,
      "agent" | "input" | "dataScope" | "context" | "parentRunId" | "depth"
    >
  | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.agent !== "string" ||
    typeof payload.input !== "string" ||
    typeof payload.depth !== "number"
  )
    return undefined;
  const dataScope = payload.dataScope;
  if (
    dataScope !== undefined &&
    (typeof dataScope !== "object" ||
      dataScope === null ||
      typeof (dataScope as Record<string, unknown>).schema !== "string")
  )
    return undefined;
  const context = payload.context;
  if (
    context !== undefined &&
    (typeof context !== "object" || context === null || Array.isArray(context))
  )
    return undefined;
  const result: {
    agent: string;
    input: string;
    dataScope?: DataScope;
    context?: NonNullable<RoomRun["context"]>;
    parentRunId?: NonNullable<RoomRun["parentRunId"]>;
    depth: number;
  } = {
    agent: payload.agent,
    input: payload.input,
    depth: payload.depth,
  };
  if (dataScope !== undefined) result.dataScope = dataScope as DataScope;
  if (context !== undefined)
    result.context = context as NonNullable<RoomRun["context"]>;
  if (typeof payload.parentRunId === "string")
    result.parentRunId = payload.parentRunId as NonNullable<
      RoomRun["parentRunId"]
    >;
  return result;
}

async function waitForRuntimeRun(
  runtime: RunManager,
  runId: string,
  owner: string,
): Promise<void> {
  for (let attempt = 0; attempt < 3_000; attempt += 1) {
    const run = await runtime.getAuthorizedRun(runId, owner);
    if (
      run &&
      [
        "awaiting_input",
        "awaiting_client_tool",
        "awaiting_plan_confirmation",
        "backgrounded",
        "completed",
        "failed",
        "interrupted",
      ].includes(run.status)
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("room_run_timeout");
}

function createMemoryQueuePersistence(): RoomQueuePersistence {
  const rows = new Map<string, RoomQueuePersistenceItem & { state: string }>();
  return {
    async enqueue(item) {
      const key = `${item.roomId}\u0000${item.runId}`;
      if (!rows.has(key)) rows.set(key, { ...item, state: "queued" });
      await Promise.resolve();
    },
    async listQueued(owner, roomId) {
      const result = [...rows.values()]
        .filter(
          (row) =>
            row.owner === owner &&
            row.roomId === roomId &&
            row.state === "queued",
        )
        .sort((left, right) => left.position - right.position);
      await Promise.resolve();
      return result;
    },
    async markStarted(owner, roomId, runId) {
      const row = rows.get(`${roomId}\u0000${runId}`);
      if (row?.owner === owner) row.state = "running";
      await Promise.resolve();
    },
    async markFinished(owner, roomId, runId, status) {
      const row = rows.get(`${roomId}\u0000${runId}`);
      if (row?.owner === owner) row.state = status;
      await Promise.resolve();
    },
  };
}

function createMemoryRoomJournal(): RoomJournalPort {
  const events = new Map<string, RoomJournalEvent[]>();
  return {
    async append(roomId, payload) {
      const key = String(roomId);
      const current = events.get(key) ?? [];
      const event: RoomJournalEvent = {
        roomId,
        seq: current.length + 1,
        payload,
      };
      events.set(key, [...current, event]);
      await Promise.resolve();
      return event;
    },
    async readFrom(roomId, afterSeq, limit) {
      const result = (events.get(String(roomId)) ?? [])
        .filter((event) => event.seq > afterSeq)
        .slice(0, limit);
      await Promise.resolve();
      return result;
    },
  };
}

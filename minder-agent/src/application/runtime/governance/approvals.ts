import { randomUUID } from "node:crypto";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ApprovalRecord {
  readonly id: string;
  readonly owner: string;
  readonly runId: string;
  readonly toolCallId: string;
  readonly action: string;
  readonly argumentsHash: string;
  readonly preview: string;
  readonly status: ApprovalStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly decidedAt?: string;
}

export interface ApprovalStore {
  get(
    owner: string,
    runId: string,
    approvalId: string,
  ): Promise<ApprovalRecord | undefined>;
  list(owner: string, runId: string): Promise<readonly ApprovalRecord[]>;
  save(record: ApprovalRecord): Promise<void>;
}

export interface ApprovalService {
  decide(input: {
    readonly owner: string;
    readonly runId: string;
    readonly approvalId: string;
    readonly decision: "approved" | "denied";
  }): Promise<ApprovalRecord | undefined>;
  list(input: {
    readonly owner: string;
    readonly runId: string;
  }): Promise<readonly ApprovalRecord[]>;
  request(
    input: Omit<ApprovalRecord, "id" | "status" | "createdAt">,
  ): Promise<ApprovalRecord>;
}

export function createApprovalService(input: {
  readonly store: ApprovalStore;
  readonly ids?: () => string;
  readonly now?: () => string;
}): ApprovalService {
  const ids = input.ids ?? randomUUID;
  const now = input.now ?? (() => new Date().toISOString());
  return {
    async request(value) {
      const record: ApprovalRecord = {
        ...value,
        id: ids(),
        status: "pending",
        createdAt: now(),
      };
      await input.store.save(record);
      return record;
    },
    async list({ owner, runId }) {
      const current = now();
      return Promise.all(
        (await input.store.list(owner, runId)).map(async (value) => {
          if (value.status !== "pending" || value.expiresAt > current)
            return value;
          const expired: ApprovalRecord = {
            ...value,
            status: "expired",
            decidedAt: current,
          };
          await input.store.save(expired);
          return expired;
        }),
      );
    },
    async decide({ owner, runId, approvalId, decision }) {
      const current = await input.store.get(owner, runId, approvalId);
      if (!current || current.status !== "pending") return current;
      const timestamp = now();
      const next: ApprovalRecord =
        current.expiresAt <= timestamp
          ? { ...current, status: "expired", decidedAt: timestamp }
          : { ...current, status: decision, decidedAt: timestamp };
      await input.store.save(next);
      return next;
    },
  };
}

export function createMemoryApprovalStore(): ApprovalStore {
  const values = new Map<string, ApprovalRecord>();
  const key = (owner: string, runId: string, id: string) =>
    `${owner}\u0000${runId}\u0000${id}`;
  return {
    get(owner, runId, approvalId) {
      return Promise.resolve(values.get(key(owner, runId, approvalId)));
    },
    list(owner, runId) {
      return Promise.resolve(
        [...values.values()]
          .filter((value) => value.owner === owner && value.runId === runId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      );
    },
    save(record) {
      values.set(key(record.owner, record.runId, record.id), record);
      return Promise.resolve();
    },
  };
}

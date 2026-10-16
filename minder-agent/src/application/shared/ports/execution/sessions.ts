import type { CallerId, RunMode, Session, SessionId } from "@domain/index.js";
export interface GetOrCreateSession {
  readonly owner: CallerId;
  readonly key: string;
  readonly mode: RunMode;
}
export interface SessionPort {
  get(id: SessionId): Promise<Session | undefined>;
  getByKey(owner: CallerId, key: string): Promise<Session | undefined>;
  getOrCreate(input: GetOrCreateSession): Promise<Session>;
  save(snapshot: Session): Promise<void>;
}

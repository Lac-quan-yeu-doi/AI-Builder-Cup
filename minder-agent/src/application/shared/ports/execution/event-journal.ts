import type { EventEnvelope, JsonValue, RunId } from "@domain/index.js";
export interface AppendRunEvent {
  readonly runId: RunId;
  readonly payload: JsonValue;
}
export interface EventJournalPort {
  append(input: AppendRunEvent): Promise<EventEnvelope>;
  readFrom(
    runId: RunId,
    afterSeq: number,
    limit: number,
  ): Promise<readonly EventEnvelope[]>;
  lastSeq(runId: RunId): Promise<number>;
}

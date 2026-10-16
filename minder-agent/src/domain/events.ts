import type { JsonValue } from "./entities/run.js";
export interface DomainEvent {
  readonly type: string;
  readonly data: JsonValue;
  readonly occurredAt: string;
}

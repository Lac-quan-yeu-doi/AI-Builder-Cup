import type { JsonObject, JsonValue } from "@domain/index.js";
export type AgentLifecycleEvent = {
  readonly type:
    | "model_started"
    | "model_finished"
    | "iteration"
    | "stream_delta"
    | "tool_dispatched"
    | "tool_result"
    | "compaction"
    | "reminder"
    | "retry"
    | "paused"
    | "completed"
    | "failed"
    | "interrupted"
    | "backgrounded";
  readonly data: JsonValue;
};
export interface LoopLifecycleSink {
  emit(event: AgentLifecycleEvent): Promise<void>;
}

/**
 * Streamed between the text of one model turn and the next. It is part of the
 * run's text, not of either turn's message — the delta carrying it is marked
 * `turnBreak` so a consumer rebuilding the transcript can leave it out.
 */
export const TURN_BREAK = "\n\n";

/** A tool call the loop is about to run, as `tool_dispatched` announces it. */
export interface ToolDispatch {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
}

/**
 * The call a `tool_dispatched` event announces, or `undefined` when the event
 * does not name one — a loop that only reports how many calls it dispatched.
 */
export function toolDispatchOf(
  event: AgentLifecycleEvent,
): ToolDispatch | undefined {
  if (event.type !== "tool_dispatched" || !isRecord(event.data))
    return undefined;
  const { id, name, arguments: args } = event.data;
  if (typeof id !== "string" || typeof name !== "string") return undefined;
  return { id, name, arguments: isRecord(args) ? args : {} };
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

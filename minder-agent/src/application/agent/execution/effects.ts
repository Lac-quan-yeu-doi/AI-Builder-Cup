import type { JsonObject, JsonValue } from "@domain/index.js";
import type { ToolResult } from "@application/shared/ports/index.js";
import type {
  LoopBackgroundTask,
  LoopTodo,
  WorkOwner,
} from "../context/context.js";

/** Durable intents emitted by tools; delivery belongs to the runtime boundary. */
export type LoopEffect =
  | { readonly kind: "tool_activated"; readonly name: string }
  | { readonly kind: "application_state"; readonly values: JsonObject }
  | { readonly kind: "artifact"; readonly metadata: JsonObject }
  | { readonly kind: "message_block"; readonly payload: JsonObject }
  | { readonly kind: "todo"; readonly todo: LoopTodo }
  | { readonly kind: "todos_replaced"; readonly todos: readonly LoopTodo[] }
  | { readonly kind: "background_task"; readonly task: LoopBackgroundTask };

/**
 * Convert the optional `metadata.loop_effects` convention into validated loop
 * intents. Metadata is tool-controlled, so malformed entries are ignored.
 */
export function extractToolEffects(
  toolName: string,
  result: ToolResult,
): readonly LoopEffect[] {
  if (!result.success) return [];
  const effects: LoopEffect[] = [{ kind: "tool_activated", name: toolName }];
  const encoded: unknown = result.metadata.loop_effects;
  if (!Array.isArray(encoded)) return effects;
  for (const value of encoded) {
    if (!isJsonValue(value)) continue;
    const effect = parseEffect(value);
    if (effect) effects.push(effect);
  }
  return effects;
}

function parseEffect(value: JsonValue): LoopEffect | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  switch (value.kind) {
    case "application_state": {
      const values = value.values;
      return isRecord(values) ? { kind: value.kind, values } : undefined;
    }
    case "artifact": {
      const metadata = value.metadata;
      return isRecord(metadata) ? { kind: value.kind, metadata } : undefined;
    }
    case "message_block": {
      const payload = value.payload;
      return isRecord(payload) ? { kind: value.kind, payload } : undefined;
    }
    case "todo": {
      const todo = parseTodo(value);
      return todo ? { kind: value.kind, todo } : undefined;
    }
    case "todos_replaced": {
      if (!Array.isArray(value.todos)) return undefined;
      const todos = value.todos.map(parseTodo);
      return todos.every((todo): todo is LoopTodo => todo !== undefined)
        ? { kind: value.kind, todos }
        : undefined;
    }
    case "background_task": {
      const id = nonEmptyString(value.taskId);
      const status = parseBackgroundTaskStatus(value.status);
      const owner = parseOwner(value.owner);
      return id && status && owner
        ? { kind: value.kind, task: { id, status, owner } }
        : undefined;
    }
    default:
      return undefined;
  }
}

function parseTodo(value: JsonValue): LoopTodo | undefined {
  if (!isRecord(value)) return undefined;
  const id = nonEmptyString(value.id);
  const status = parseTodoStatus(value.status);
  const owner = parseOwner(value.owner);
  const content =
    value.content === undefined ? undefined : nonEmptyString(value.content);
  if (!id || !status || !owner || (value.content !== undefined && !content))
    return undefined;
  return { id, status, owner, ...(content === undefined ? {} : { content }) };
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function nonEmptyString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseOwner(value: JsonValue | undefined): WorkOwner | undefined {
  if (value === undefined) return "run";
  return value === "run" || value === "external" ? value : undefined;
}

function parseTodoStatus(
  value: JsonValue | undefined,
): LoopTodo["status"] | undefined {
  return value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "failed"
    ? value
    : undefined;
}

function parseBackgroundTaskStatus(
  value: JsonValue | undefined,
): LoopBackgroundTask["status"] | undefined {
  if (value === undefined) return "running";
  return value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
    ? value
    : undefined;
}

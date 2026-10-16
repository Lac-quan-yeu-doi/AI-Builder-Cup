import type { JsonObject } from "@domain/shared";
import type { MinderTool, ToolContext, ToolResult } from "./types.js";
import { toolFailure as failure } from "./tool-result.js";

const TODO_STATUSES = new Set([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

const TODO_WRITE_PARAMETERS: JsonObject = {
  type: "object",
  properties: {
    todos: {
      type: "array",
      description:
        "The complete ordered todo list. Each item requires content and may include id and status.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          status: { type: "string" },
        },
        required: ["content"],
      },
    },
  },
  required: ["todos"],
  additionalProperties: false,
};

const TASK_UPDATE_PARAMETERS: JsonObject = {
  type: "object",
  properties: {
    id: { type: "string", description: "Todo ID to update." },
    status: {
      type: "string",
      description: "One of pending, in_progress, completed, or failed.",
    },
  },
  required: ["id", "status"],
  additionalProperties: false,
};

interface TodoInput {
  readonly id: string;
  readonly content: string;
  readonly status: string;
}

export class TodoWriteTool implements MinderTool {
  readonly name = "TodoWrite";
  readonly description =
    "Replace the run's todo list. Keep work statuses accurate before ending the task.";
  readonly category = "session" as const;
  readonly readOnly = false;
  readonly destructive = false;
  readonly aliases = ["write_todos"] as const;
  readonly parameters = TODO_WRITE_PARAMETERS;

  async execute(args: JsonObject, _context: ToolContext): Promise<ToolResult> {
    await Promise.resolve();
    const todos = parseTodoInputs(args.todos);
    if (todos === undefined)
      return failure(
        "todos must be an array of unique items with non-empty content and valid statuses.",
      );
    return {
      success: true,
      output:
        todos.length === 0
          ? "Cleared all todos."
          : `Saved ${todos.length} todo${todos.length === 1 ? "" : "s"}: ${todos.map((todo) => `[${todo.status}] ${todo.content}`).join("; ")}`,
      metadata: {
        loop_effects: [
          {
            kind: "todos_replaced",
            todos: todos.map((todo) => ({
              id: todo.id,
              content: todo.content,
              status: todo.status,
              owner: "run",
            })),
          },
        ],
      },
    };
  }
}

export class TaskUpdateTool implements MinderTool {
  readonly name = "TaskUpdate";
  readonly description = "Update the status of one existing todo.";
  readonly category = "session" as const;
  readonly readOnly = false;
  readonly destructive = false;
  readonly aliases = ["update_todo"] as const;
  readonly parameters = TASK_UPDATE_PARAMETERS;

  async execute(args: JsonObject, _context: ToolContext): Promise<ToolResult> {
    await Promise.resolve();
    const id = nonEmptyString(args.id);
    const status = typeof args.status === "string" ? args.status : "";
    if (!id || !TODO_STATUSES.has(status))
      return failure("id and a valid todo status are required.");
    return {
      success: true,
      output: `Todo ${id} is now ${status}.`,
      metadata: {
        loop_effects: [{ kind: "todo", id, status, owner: "run" }],
      },
    };
  }
}

function parseTodoInputs(value: unknown): readonly TodoInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const todos: TodoInput[] = [];
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return undefined;
    const id = nonEmptyString(item.id) ?? `todo-${index + 1}`;
    const content = nonEmptyString(item.content);
    const status =
      item.status === undefined
        ? "pending"
        : typeof item.status === "string"
          ? item.status
          : "";
    if (!content || !TODO_STATUSES.has(status) || ids.has(id)) return undefined;
    ids.add(id);
    todos.push({ id, content, status });
  }
  return todos;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

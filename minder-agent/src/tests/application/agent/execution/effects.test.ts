import type { ToolResult } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import { extractToolEffects } from "@application/agent/execution/effects.js";

describe("extractToolEffects", () => {
  it("keeps only validated effect intents from successful tool metadata", () => {
    const result: ToolResult = {
      success: true,
      content: "done",
      metadata: {
        loop_effects: [
          { kind: "artifact", metadata: { path: "report.md" } },
          { kind: "background_task", taskId: "task-1" },
          { kind: "artifact", metadata: "invalid" },
        ],
      },
    };

    expect(extractToolEffects("Write", result)).toEqual([
      { kind: "tool_activated", name: "Write" },
      { kind: "artifact", metadata: { path: "report.md" } },
      {
        kind: "background_task",
        task: { id: "task-1", owner: "run", status: "running" },
      },
    ]);
  });

  it("does not create effects for failed tools", () => {
    expect(
      extractToolEffects("Write", {
        success: false,
        content: "failed",
        metadata: { loop_effects: [{ kind: "background_task", taskId: "x" }] },
      }),
    ).toEqual([]);
  });

  it("accepts only valid owned todo and background state transitions", () => {
    const result: ToolResult = {
      success: true,
      content: "updated",
      metadata: {
        loop_effects: [
          {
            kind: "todo",
            id: "implement",
            status: "in_progress",
          },
          {
            kind: "background_task",
            taskId: "research",
            status: "completed",
            owner: "external",
          },
          { kind: "todo", id: "bad", status: "unknown" },
          { kind: "background_task", taskId: "bad", status: "unknown" },
        ],
      },
    };

    expect(extractToolEffects("TaskUpdate", result)).toEqual([
      { kind: "tool_activated", name: "TaskUpdate" },
      {
        kind: "todo",
        todo: { id: "implement", status: "in_progress", owner: "run" },
      },
      {
        kind: "background_task",
        task: { id: "research", status: "completed", owner: "external" },
      },
    ]);
  });

  it("accepts a complete replacement todo list with durable content", () => {
    expect(
      extractToolEffects("TodoWrite", {
        success: true,
        content: "saved",
        metadata: {
          loop_effects: [
            {
              kind: "todos_replaced",
              todos: [
                {
                  id: "implement",
                  content: "Implement resume",
                  status: "in_progress",
                  owner: "run",
                },
              ],
            },
          ],
        },
      }),
    ).toEqual([
      { kind: "tool_activated", name: "TodoWrite" },
      {
        kind: "todos_replaced",
        todos: [
          {
            id: "implement",
            content: "Implement resume",
            status: "in_progress",
            owner: "run",
          },
        ],
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  TaskUpdateTool,
  TodoWriteTool,
} from "@infrastructure/tools/core/index.js";

const context = {
  workspaceRoot: process.cwd(),
  workingDirectory: process.cwd(),
  signal: new AbortController().signal,
};

describe("TodoWriteTool", () => {
  it("emits a complete durable todo replacement with generated IDs", async () => {
    const result = await new TodoWriteTool().execute(
      {
        todos: [
          { content: "Inspect the repository" },
          {
            id: "implement",
            content: "Implement the fix",
            status: "in_progress",
          },
        ],
      },
      context,
    );

    expect(result).toMatchObject({
      success: true,
      metadata: {
        loop_effects: [
          {
            kind: "todos_replaced",
            todos: [
              {
                id: "todo-1",
                content: "Inspect the repository",
                status: "pending",
                owner: "run",
              },
              {
                id: "implement",
                content: "Implement the fix",
                status: "in_progress",
                owner: "run",
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects duplicate IDs and invalid statuses", async () => {
    await expect(
      new TodoWriteTool().execute(
        {
          todos: [
            { id: "same", content: "One" },
            { id: "same", content: "Two", status: "unknown" },
          ],
        },
        context,
      ),
    ).resolves.toMatchObject({ success: false });
  });
});

describe("TaskUpdateTool", () => {
  it("emits a durable status transition", async () => {
    await expect(
      new TaskUpdateTool().execute(
        { id: "implement", status: "completed" },
        context,
      ),
    ).resolves.toMatchObject({
      success: true,
      metadata: {
        loop_effects: [
          {
            kind: "todo",
            id: "implement",
            status: "completed",
            owner: "run",
          },
        ],
      },
    });
  });
});

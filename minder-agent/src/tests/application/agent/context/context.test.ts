import { describe, expect, it } from "vitest";
import {
  assessWorkSafety,
  resetOwnedInProgressTodos,
} from "@application/agent/context/context.js";

describe("work safety controls", () => {
  it("blocks completion while an owned todo remains in progress", () => {
    expect(
      assessWorkSafety({
        todos: [{ id: "owned", owner: "run", status: "in_progress" }],
        backgroundTasks: [],
      }),
    ).toEqual({ kind: "wait_for_todos", todoIds: ["owned"] });
  });

  it("backgrounds the run while owned background work remains active", () => {
    expect(
      assessWorkSafety({
        todos: [{ id: "done", owner: "run", status: "completed" }],
        backgroundTasks: [{ id: "task", owner: "run", status: "running" }],
      }),
    ).toEqual({ kind: "background", taskIds: ["task"] });
  });

  it("resets only owned in-progress todos after interruption", () => {
    expect(
      resetOwnedInProgressTodos([
        { id: "owned", owner: "run", status: "in_progress" },
        { id: "external", owner: "external", status: "in_progress" },
        { id: "done", owner: "run", status: "completed" },
      ]),
    ).toEqual([
      { id: "owned", owner: "run", status: "pending" },
      { id: "external", owner: "external", status: "in_progress" },
      { id: "done", owner: "run", status: "completed" },
    ]);
  });
});

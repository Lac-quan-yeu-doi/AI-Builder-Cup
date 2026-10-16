import { describe, expect, it } from "vitest";
import { planCompaction } from "@application/context";

describe("planCompaction", () => {
  const messages = [
    { id: "system", role: "system" as const, content: "system" },
    { id: "old", role: "user" as const, content: "old" },
    {
      id: "call",
      role: "assistant" as const,
      content: "call",
      toolCallId: "tool-1",
    },
    {
      id: "result",
      role: "tool" as const,
      content: "result",
      toolCallId: "tool-1",
    },
    {
      id: "pause",
      role: "assistant" as const,
      content: "pause",
      pendingPause: true,
    },
    { id: "recent", role: "user" as const, content: "recent" },
  ];

  it.each([
    [69, "none"],
    [70, "warn"],
    [80, "mask"],
    [85, "prune"],
    [90, "aggressive"],
    [99, "compact"],
  ] as const)("chooses %i%% usage action %s", (usagePercent, action) => {
    expect(planCompaction({ messages, usagePercent }).action).toBe(action);
  });

  it("preserves system, pending pause, and both sides of unresolved tool work when pruning", () => {
    const plan = planCompaction({ messages, usagePercent: 90 });

    expect(plan.retained.map((message) => message.id)).toEqual([
      "system",
      "call",
      "result",
      "pause",
      "recent",
    ]);
    expect(plan.reason).toContain("90%");
  });
});

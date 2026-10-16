import { describe, expect, it } from "vitest";
import { continueLoopSnapshot } from "@application/agent/execution/react-loop-state.js";

describe("continueLoopSnapshot", () => {
  it("resumes a proposed plan through its paused tool call", () => {
    const snapshot = {
      version: 1 as const,
      iteration: 1,
      messages: [
        {
          role: "assistant" as const,
          content: "",
          toolCalls: [
            {
              id: "plan-1",
              name: "ProposePlan",
              arguments: { steps: [] },
            },
          ],
        },
        {
          role: "tool" as const,
          toolCallId: "plan-1",
          content: "Plan delivered for review.",
        },
      ],
      pendingPause: {
        kind: "plan" as const,
        request: { steps: [] },
      },
    };

    expect(
      continueLoopSnapshot({
        snapshot,
        toolResult: {
          toolCallId: "plan-1",
          content: "Plan approved by the user.",
          isError: false,
        },
      }),
    ).toMatchObject({
      messages: [
        {},
        { toolCallId: "plan-1", content: "Plan approved by the user." },
      ],
    });
  });
});

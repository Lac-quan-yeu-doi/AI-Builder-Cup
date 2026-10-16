import type { ModelDelta } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import { assembleModelTurn } from "@application/agent/execution/stream-assembly.js";

describe("assembleModelTurn", () => {
  it("merges fragmented tool arguments before parsing them", () => {
    const turn = assembleModelTurn([
      {
        toolCallDelta: {
          index: 0,
          id: "a",
          name: "Read",
          argumentsText: '{"path":',
        },
      },
      {
        toolCallDelta: { index: 0, argumentsText: '"README.md"}' },
        finishReason: "tool_calls",
      },
    ] satisfies readonly ModelDelta[]);

    expect(turn.toolCalls).toEqual([
      expect.objectContaining({
        id: "a",
        name: "Read",
        rawArguments: '{"path":"README.md"}',
        parsedArguments: { path: "README.md" },
        complete: true,
      }),
    ]);
    expect(turn.finishReason).toBe("tool_calls");
  });

  it("defers malformed JSON failure until the streamed turn is finalized", () => {
    const turn = assembleModelTurn([
      {
        toolCallDelta: {
          index: 0,
          id: "bad",
          name: "Read",
          argumentsText: "{bad",
        },
      },
      { finishReason: "tool_calls" },
    ] satisfies readonly ModelDelta[]);

    expect(turn.toolCalls[0]).toMatchObject({
      rawArguments: "{bad",
      complete: true,
    });
    expect(turn.toolCalls[0]?.parsedArguments).toBeUndefined();
    expect(turn.toolCalls[0]?.parseError).toContain("JSON");
  });

  it("retains Gemini tool-call metadata while assembling a turn", () => {
    const turn = assembleModelTurn([
      {
        toolCallDelta: {
          index: 0,
          id: "a",
          name: "Read",
          argumentsText: "{}",
          extraContent: { google: { custom: true } },
        },
      },
      {
        toolCallDelta: {
          index: 0,
          extraContent: {
            google: { thought_signature: "opaque-signature" },
          },
        },
        finishReason: "tool_calls",
      },
    ] satisfies readonly ModelDelta[]);

    expect(turn.toolCalls[0]).toMatchObject({
      extraContent: {
        google: { custom: true, thought_signature: "opaque-signature" },
      },
    });
  });
});

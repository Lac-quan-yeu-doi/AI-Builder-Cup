import type {
  ChatCompletionGateway,
  ChatCompletionRequest,
  ModelStreamEvent,
} from "@application/shared/ports/index.js";
import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createLangChainChatModel } from "@infrastructure/agent/langchain/model.js";

function fakeGateway(
  events: readonly ModelStreamEvent[],
): ChatCompletionGateway & { requests: ChatCompletionRequest[] } {
  const requests: ChatCompletionRequest[] = [];
  return {
    requests,
    async *stream(request, signal) {
      requests.push(request);
      if (signal.aborted) throw new Error("aborted");
      yield* events;
    },
  };
}

describe("createLangChainChatModel", () => {
  it("converts gateway text into an AI message", async () => {
    const gateway = fakeGateway([
      { type: "text", text: "answer" },
      { type: "usage", input: 3, output: 2 },
      { type: "finish", reason: "stop" },
    ]);
    const model = createLangChainChatModel({
      gateway,
      model: "test-model",
    });

    const result = await model.invoke([new HumanMessage("hello")]);

    expect(result.content).toBe("answer");
    expect(gateway.requests[0]).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    });
  });

  it("binds LangChain tools into the existing gateway tool schema", async () => {
    const gateway = fakeGateway([
      {
        type: "tool_call",
        call: {
          id: "call-1",
          name: "lookup",
          arguments: JSON.stringify({ query: "cats" }),
        },
      },
      { type: "finish", reason: "tool_calls" },
    ]);
    const model = createLangChainChatModel({
      gateway,
      model: "test-model",
    });
    const lookup = tool(async () => "ok", {
      name: "lookup",
      description: "Look something up",
      schema: z.object({ query: z.string() }),
    });

    const result = await model.bindTools!([lookup]).invoke([
      new HumanMessage("find cats"),
    ]);

    expect(result.tool_calls).toEqual([
      {
        type: "tool_call",
        id: "call-1",
        name: "lookup",
        args: { query: "cats" },
      },
    ]);
    expect(gateway.requests[0]?.tools).toEqual([
      {
        type: "function",
        function: {
          name: "lookup",
          description: "Look something up",
          parameters: expect.any(Object),
        },
      },
    ]);
  });
});

import type {
  ChatCompletionGateway,
  ChatCompletionRequest,
  ToolDefinition,
} from "@infrastructure/ai/index.js";
import { describe, expect, it } from "vitest";

const acceptsGateway = (_gateway: ChatCompletionGateway): void => undefined;

describe("Minder model boundary", () => {
  it("accepts a gateway without importing provider-specific types", () => {
    expect(acceptsGateway).toBeTypeOf("function");
  });

  it("models function tools and tool-result messages", () => {
    const tool: ToolDefinition = {
      type: "function",
      function: {
        name: "Read",
        description: "Read a file.",
        parameters: {
          type: "object",
          properties: { file_path: { type: "string" } },
          required: ["file_path"],
        },
      },
    };
    const request: ChatCompletionRequest = {
      model: "minder-test",
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "Read", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "result" },
      ],
      tools: [tool],
      tool_choice: "auto",
      stream: true,
    };
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
  });
});

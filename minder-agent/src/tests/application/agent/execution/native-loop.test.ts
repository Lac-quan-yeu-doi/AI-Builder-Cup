import { ToolRegistry, type ToolContext } from "@infrastructure/tools/core";
import type { AgentEvent } from "@domain/shared";
import { describe, expect, it } from "vitest";
import { streamNativeToolCalls } from "@application/agent";

const context: ToolContext = {
  workspaceRoot: process.cwd(),
  workingDirectory: process.cwd(),
  signal: new AbortController().signal,
};

async function collect(
  generator: AsyncGenerator<AgentEvent, void, void>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe("streamNativeToolCalls", () => {
  it("executes model calls in order and returns one tool message for each call", async () => {
    const executionOrder: string[] = [];
    const registry = new ToolRegistry([
      {
        name: "First",
        description: "First test tool.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 5));
          executionOrder.push("First");
          return { success: true, output: "first result", metadata: {} };
        },
      },
      {
        name: "Second",
        description: "Second test tool.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        async execute() {
          executionOrder.push("Second");
          return { success: false, output: "second failed", metadata: {} };
        },
      },
    ]);

    const events = await collect(
      streamNativeToolCalls({
        calls: [
          { id: "call-1", name: "First", arguments: "{}" },
          { id: "call-2", name: "Second", arguments: "{}" },
        ],
        registry,
        context,
      }),
    );

    expect(executionOrder).toEqual(["First", "Second"]);
    expect(events).toEqual([
      {
        type: "tool_started",
        data: { id: "call-1", name: "First", arguments: {} },
      },
      {
        type: "tool_finished",
        data: { id: "call-1", name: "First", success: true },
      },
      {
        type: "tool_result",
        data: {
          id: "call-1",
          name: "First",
          is_error: false,
          content: "first result",
        },
      },
      {
        type: "tool_started",
        data: { id: "call-2", name: "Second", arguments: {} },
      },
      {
        type: "tool_finished",
        data: { id: "call-2", name: "Second", success: false },
      },
      {
        type: "tool_result",
        data: {
          id: "call-2",
          name: "Second",
          is_error: true,
          content: "second failed",
        },
      },
    ]);
  });

  it("makes malformed model tool arguments a durable failed tool result", async () => {
    const registry = new ToolRegistry([
      {
        name: "NeverCalled",
        description: "Tool that requires a JSON object.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        async execute() {
          throw new Error("must not run");
        },
      },
    ]);

    const events = await collect(
      streamNativeToolCalls({
        calls: [{ id: "call-bad", name: "NeverCalled", arguments: "not json" }],
        registry,
        context,
      }),
    );

    expect(events).toEqual([
      {
        type: "tool_started",
        data: { id: "call-bad", name: "NeverCalled", arguments: {} },
      },
      {
        type: "tool_finished",
        data: { id: "call-bad", name: "NeverCalled", success: false },
      },
      {
        type: "tool_result",
        data: {
          id: "call-bad",
          name: "NeverCalled",
          is_error: true,
          content: "Tool NeverCalled arguments were not valid JSON.",
        },
      },
    ]);
  });
});

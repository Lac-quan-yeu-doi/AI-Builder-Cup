import type { ModelPort } from "@application/shared/ports/index.js";
import type { RunId } from "@domain/index.js";
import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { createLangChainAgentLoop } from "@infrastructure/agent/langchain/loop.js";

describe("createLangChainAgentLoop", () => {
  it("runs a LangGraph turn through the application lifecycle boundary", async () => {
    const requests: string[] = [];
    const model: ModelPort = {
      async *stream(request) {
        requests.push(request.messages.at(-1)?.content ?? "");
        yield { text: "done" };
        yield { finishReason: "stop" };
      },
    };
    const loop = createLangChainAgentLoop({
      checkpointer: new MemorySaver(),
    });
    const execution = loop.run(
      {
        run: {
          id: "run-1" as RunId,
          status: "running",
          mode: "autonomous",
          trigger: { source: "test" },
          input: "hello",
          depth: 0,
          createdAt: new Date().toISOString(),
        },
        checkpointThreadId: "session-1",
        policy: {
          maxIterations: 2,
          doomLoop: { maxRepeatedToolCalls: 0 },
          toolSelection: { allowParallelReadOnly: false },
          reminders: { enabled: false },
          compaction: { enabled: false, tokenThreshold: 1_000_000 },
        },
        systemPrompt: "You are a test agent.",
        services: { model, tools: [] },
      },
      new AbortController().signal,
    );

    const events = [];
    for await (const event of execution.events) events.push(event);
    const outcome = await execution.outcome;

    expect(outcome).toMatchObject({ kind: "completed", text: "done" });
    expect(events.map((event) => event.type)).toEqual([
      "model_started",
      "stream_delta",
      "model_finished",
      "completed",
    ]);
    expect(requests).toEqual(["hello"]);
  });

  it("executes read-only tools through ToolPort and continues the turn", async () => {
    let calls = 0;
    const model: ModelPort = {
      async *stream(request) {
        calls += 1;
        if (calls === 1) {
          yield {
            toolCall: {
              id: "call-1",
              name: "Lookup",
              arguments: { query: "cats" },
              rawArguments: '{"query":"cats"}',
            },
          };
          yield { finishReason: "tool_calls" };
          return;
        }
        expect(request.messages.at(-1)?.role).toBe("tool");
        yield { text: "found" };
        yield { finishReason: "stop" };
      },
    };
    const tool = {
      descriptor: {
        name: "Lookup",
        description: "Look something up",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        category: "read" as const,
        readOnly: true,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return { success: true, content: "cats found", metadata: {} };
      },
    };
    const loop = createLangChainAgentLoop({ checkpointer: new MemorySaver() });
    const execution = loop.run(
      {
        run: {
          id: "run-2" as RunId,
          status: "running",
          mode: "autonomous",
          trigger: { source: "test" },
          input: "find cats",
          depth: 0,
          createdAt: new Date().toISOString(),
        },
        checkpointThreadId: "session-2",
        policy: {
          maxIterations: 2,
          doomLoop: { maxRepeatedToolCalls: 0 },
          toolSelection: { allowParallelReadOnly: false },
          reminders: { enabled: false },
          compaction: { enabled: false, tokenThreshold: 1_000_000 },
        },
        services: { model, tools: [tool] },
      },
      new AbortController().signal,
    );

    const events = [];
    for await (const event of execution.events) events.push(event);
    const outcome = await execution.outcome;

    expect(outcome).toMatchObject({ kind: "completed", text: "found" });
    expect(events.find((event) => event.type === "tool_result")).toMatchObject({
      data: {
        id: "call-1",
        name: "Lookup",
        content: "cats found",
        isError: false,
      },
    });
  });
});

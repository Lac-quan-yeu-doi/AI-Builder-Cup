import type {
  ChatCompletionGateway,
  ChatCompletionRequest,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import type { AgentEvent, RunOutcome } from "@domain/shared";
import { ToolRegistry, type ToolContext } from "@infrastructure/tools/core";
import { describe, expect, it } from "vitest";
import {
  AUTONOMOUS_SYSTEM_PROMPT,
  streamAutonomousTurn,
} from "@application/agent";
import type { AgentLoop } from "@application/agent";

const config: LlmConfig = {
  baseUrl: "http://example.test/v1",
  apiKey: "key",
  model: "m",
};

interface FakeGateway extends ChatCompletionGateway {
  readonly requests: ChatCompletionRequest[];
}

function fakeGateway(
  events: readonly ModelStreamEvent[],
  failure?: Error,
): FakeGateway {
  const requests: ChatCompletionRequest[] = [];
  return {
    requests,
    async *stream(request, signal) {
      requests.push(request);
      if (signal.aborted) throw abortError();
      for (const event of events) {
        if (signal.aborted) throw abortError();
        yield event;
      }
      if (failure !== undefined) throw failure;
    },
  };
}

async function collect(
  generator: AsyncGenerator<AgentEvent, RunOutcome, void>,
): Promise<{ events: AgentEvent[]; outcome: RunOutcome }> {
  const events: AgentEvent[] = [];
  while (true) {
    const next = await generator.next();
    if (next.done) return { events, outcome: next.value };
    events.push(next.value);
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function scriptedGateway(
  scripts: readonly (readonly ModelStreamEvent[])[],
): ChatCompletionGateway & { requests: ChatCompletionRequest[] } {
  const requests: ChatCompletionRequest[] = [];
  let call = 0;
  return {
    requests,
    async *stream(request) {
      requests.push(request);
      yield* scripts[call++] ?? [];
    },
  };
}

const toolContext: ToolContext = {
  workspaceRoot: process.cwd(),
  workingDirectory: process.cwd(),
  signal: new AbortController().signal,
};

describe("streamAutonomousTurn", () => {
  it("uses an injected agent loop when provided", async () => {
    let calls = 0;
    const loop: AgentLoop = {
      run() {
        calls += 1;
        return {
          events: (async function* () {
            yield {
              type: "completed" as const,
              data: { outcome: { kind: "completed" as const, text: "done" } },
            };
          })(),
          outcome: Promise.resolve({
            kind: "completed" as const,
            text: "done",
          }),
        };
      },
    };
    const result = await collect(
      streamAutonomousTurn({
        config,
        gateway: fakeGateway([]),
        prompt: "run through the injected loop",
        signal: new AbortController().signal,
        loop,
      }),
    );

    expect(calls).toBe(1);
    expect(result.outcome).toMatchObject({ status: "completed", text: "done" });
  });

  it("sends the autonomous prompt and preserves normalized event order", async () => {
    const gateway = fakeGateway([
      { type: "reasoning", text: "inspect" },
      { type: "text", text: "answer" },
      { type: "usage", input: 3, output: 2 },
    ]);
    const result = await collect(
      streamAutonomousTurn({
        config,
        gateway,
        prompt: "summarize this task",
        signal: new AbortController().signal,
      }),
    );

    expect(result.events).toEqual([
      { type: "reasoning", data: "inspect" },
      { type: "text", data: "answer" },
      { type: "token_usage", data: { input: 3, output: 2 } },
      { type: "done", data: { response_text: "answer" } },
    ]);
    expect(result.outcome).toMatchObject({
      status: "completed",
      text: "answer",
      loopSnapshot: { version: 1 },
    });
    expect(gateway.requests[0]).toEqual({
      model: "m",
      messages: [
        {
          role: "system",
          content: expect.stringContaining(AUTONOMOUS_SYSTEM_PROMPT),
        },
        { role: "user", content: "summarize this task" },
      ],
      stream: true,
    });
  });

  it("rejects blank input with one terminal event and no provider call", async () => {
    const gateway = fakeGateway([]);
    const result = await collect(
      streamAutonomousTurn({
        config,
        gateway,
        prompt: "  ",
        signal: new AbortController().signal,
      }),
    );

    expect(result.events).toEqual([
      { type: "done", data: { response_text: "" } },
    ]);
    expect(result.outcome).toEqual({
      status: "failed",
      text: "",
      error: {
        code: "invalid_input",
        message: "Task prompt must not be empty.",
      },
    });
    expect(gateway.requests).toHaveLength(0);
  });

  it("returns a normalized failure with partial text", async () => {
    const gateway = fakeGateway(
      [{ type: "text", text: "partial" }],
      Object.assign(new Error("Provider rejected the request (HTTP 401)."), {
        code: "provider",
      }),
    );
    const result = await collect(
      streamAutonomousTurn({
        config,
        gateway,
        prompt: "continue",
        signal: new AbortController().signal,
      }),
    );

    expect(result.events).toEqual([
      { type: "text", data: "partial" },
      { type: "done", data: { response_text: "partial" } },
    ]);
    expect(result.outcome).toMatchObject({
      status: "failed",
      text: "partial",
      error: {
        code: "provider",
        message: "Provider rejected the request (HTTP 401).",
      },
      loopSnapshot: { version: 1 },
    });
  });

  it("turns an aborted signal into one interrupted terminal outcome", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await collect(
      streamAutonomousTurn({
        config,
        gateway: fakeGateway([]),
        prompt: "interrupt",
        signal: controller.signal,
      }),
    );

    expect(result.events).toEqual([
      { type: "done", data: { response_text: "" } },
    ]);
    expect(result.outcome).toEqual({
      status: "interrupted",
      text: "",
      error: { code: "interrupted", message: "Run interrupted." },
    });
  });

  it("executes available tools and gives their result to the next autonomous model turn", async () => {
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: { id: "tool-1", name: "Inspect", arguments: "{}" },
        },
      ],
      [{ type: "text", text: "Task complete." }],
    ]);
    const registry = new ToolRegistry([
      {
        name: "Inspect",
        description: "Inspect the workspace.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        async execute() {
          return { success: true, output: "inspection", metadata: {} };
        },
      },
    ]);

    const result = await collect(
      streamAutonomousTurn({
        config,
        gateway,
        prompt: "inspect then answer",
        signal: new AbortController().signal,
        registry,
        context: toolContext,
      }),
    );

    expect(result.events.map((event) => event.type)).toEqual([
      "tool_started",
      "tool_finished",
      "tool_result",
      "text",
      "done",
    ]);
    expect(result.outcome).toMatchObject({
      status: "completed",
      text: "Task complete.",
      loopSnapshot: { version: 1 },
    });
    expect(gateway.requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      name: "Inspect",
      tool_call_id: "tool-1",
      content: "inspection",
    });
  });

  it("reports a tool as started before it runs", async () => {
    let releaseTool!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseTool = resolve;
    });
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: { id: "tool-1", name: "Inspect", arguments: "{}" },
        },
      ],
      [{ type: "text", text: "Task complete." }],
    ]);
    const registry = new ToolRegistry([
      {
        name: "Inspect",
        description: "Inspect the workspace.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        async execute() {
          await Promise.race([
            released,
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error("tool ran before tool_started was announced"),
                  ),
                2_000,
              ),
            ),
          ]);
          return { success: true, output: "inspection", metadata: {} };
        },
      },
    ]);
    const turn = streamAutonomousTurn({
      config,
      gateway,
      prompt: "inspect then answer",
      signal: new AbortController().signal,
      registry,
      context: toolContext,
    });

    const seen: string[] = [];
    for (let next = await turn.next(); !next.done; next = await turn.next()) {
      seen.push(next.value.type);
      if (next.value.type === "tool_started") releaseTool();
    }

    expect(seen).toEqual([
      "tool_started",
      "tool_finished",
      "tool_result",
      "text",
      "done",
    ]);
  });

  it("preserves validated tool arguments in the public start event", async () => {
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "tool-arguments",
            name: "Inspect",
            arguments: '{"path":"README.md"}',
          },
        },
      ],
      [{ type: "text", text: "Done." }],
    ]);
    const registry = new ToolRegistry([
      {
        name: "Inspect",
        description: "Inspect a path.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false,
        },
        async execute() {
          return { success: true, output: "inspection", metadata: {} };
        },
      },
    ]);

    const result = await collect(
      streamAutonomousTurn({
        config,
        gateway,
        prompt: "inspect the README",
        signal: new AbortController().signal,
        registry,
        context: toolContext,
      }),
    );

    expect(result.events).toContainEqual({
      type: "tool_started",
      data: {
        id: "tool-arguments",
        name: "Inspect",
        arguments: { path: "README.md" },
      },
    });
  });
});

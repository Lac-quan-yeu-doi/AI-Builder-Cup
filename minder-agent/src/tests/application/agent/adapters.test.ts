import type {
  ChatCompletionGateway,
  ChatCompletionRequest,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { MinderTool, ToolContext } from "@infrastructure/tools/core";
import {
  createAutonomousRegistry,
  ToolRegistry,
} from "@infrastructure/tools/core";
import { runId, type WorkspacePath } from "@domain/index.js";
import type { ToolExecutionContext } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  gatewayToModelPort,
  registryToToolPorts,
} from "@application/agent/adapters/model-port.js";

function gateway(events: ModelStreamEvent[]): ChatCompletionGateway {
  return {
    async *stream() {
      for (const event of events) yield event;
    },
  };
}

const execContext = (signal: AbortSignal): ToolExecutionContext => ({
  workspace: "/w" as WorkspacePath,
  signal,
  values: new Map(),
});

describe("gatewayToModelPort", () => {
  it("serializes prior assistant tool calls in OpenAI-compatible form", async () => {
    const requests: ChatCompletionRequest[] = [];
    const port = gatewayToModelPort(
      {
        async *stream(request) {
          requests.push(request);
          yield { type: "finish" as const, reason: "stop" as const };
        },
      },
      "m1",
      undefined,
      undefined,
      "gemini",
    );

    const deltas = [];
    for await (const delta of port.stream(
      {
        model: "m1",
        messages: [
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call_1",
                name: "Read",
                arguments: { file_path: "package.json" },
                extraContent: {
                  google: { thought_signature: "opaque-signature" },
                },
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call_1",
            content: "read result",
          },
        ],
        tools: [
          {
            name: "Fetch",
            description: "fetch",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                uri: { type: "string", format: "uri" },
              },
            },
          },
        ],
      },
      new AbortController().signal,
    ))
      deltas.push(delta);

    expect(deltas).toEqual([{ finishReason: "stop" }]);
    expect(requests[0]?.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "Read",
              arguments: '{"file_path":"package.json"}',
            },
            extra_content: {
              google: { thought_signature: "opaque-signature" },
            },
          },
        ],
      },
      {
        role: "tool",
        name: "Read",
        tool_call_id: "call_1",
        content: "read result",
      },
    ]);
    expect(requests[0]?.tools).toEqual([
      {
        type: "function",
        function: {
          name: "Fetch",
          description: "fetch",
          parameters: {
            type: "object",
            properties: { uri: { type: "string" } },
          },
        },
      },
    ]);
  });

  it("preserves malformed provider arguments for loop-level recovery", async () => {
    const port = gatewayToModelPort(
      gateway([
        {
          type: "tool_call",
          call: { id: "bad-1", name: "Read", arguments: "{bad" },
        },
      ]),
      "m1",
      undefined,
    );
    const deltas = [];
    for await (const delta of port.stream(
      { model: "m1", messages: [] },
      new AbortController().signal,
    )) {
      deltas.push(delta);
    }

    expect(deltas[0]?.toolCallDelta).toMatchObject({
      id: "bad-1",
      name: "Read",
      argumentsText: "{bad",
    });
  });

  it("maps provider tool calls to lossless unparsed model fragments", async () => {
    const port = gatewayToModelPort(
      gateway([
        { type: "text", text: "hello" },
        {
          type: "tool_call",
          call: {
            id: "1",
            name: "Read",
            arguments: '{"path":"a"}',
            extraContent: { google: { thought_signature: "sig" } },
          },
        },
        { type: "finish", reason: "tool_calls" },
        { type: "usage", input: 3, output: 4 },
      ]),
      "m1",
      undefined,
    );
    const deltas = [];
    for await (const delta of port.stream(
      { model: "m1", messages: [] },
      new AbortController().signal,
    )) {
      deltas.push(delta);
    }
    expect(deltas[0]).toEqual({ text: "hello" });
    expect(deltas[1]?.toolCallDelta).toEqual({
      index: 0,
      id: "1",
      name: "Read",
      argumentsText: '{"path":"a"}',
      extraContent: { google: { thought_signature: "sig" } },
    });
    expect(deltas[2]?.finishReason).toBe("tool_calls");
    expect(deltas[3]?.usage).toEqual({ input: 3, output: 4 });
  });
});

describe("registryToToolPorts", () => {
  it("wraps registry tools as ToolPorts that execute through the registry", async () => {
    const echo: MinderTool = {
      name: "Echo",
      description: "echo",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: true,
      },
      async execute(args) {
        return { success: true, output: JSON.stringify(args), metadata: {} };
      },
    };
    const registry = new ToolRegistry([echo]);
    const ports = registryToToolPorts(registry, [echo], {
      workspaceRoot: "/w",
      workingDirectory: "/w",
    });
    const result = await ports[0]!.execute(
      { x: 1 },
      execContext(new AbortController().signal),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('"x":1');
  });

  it("preserves trusted run observability context for each execution", async () => {
    let received: ToolContext | undefined;
    const observe: MinderTool = {
      name: "Observe",
      description: "capture execution context",
      parameters: { type: "object", additionalProperties: false },
      async execute(_args, context) {
        received = context;
        return { success: true, output: "ok", metadata: {} };
      },
    };
    const registry = new ToolRegistry([observe]);
    const progress = { report: async () => undefined };
    const diagnostics = { record: async () => undefined };
    const fileAccess = { record: async () => undefined, list: async () => [] };
    const ports = registryToToolPorts(registry, [observe], {
      workspaceRoot: "/workspace",
      workingDirectory: "/workspace/project",
      runId: "durable-run",
      roomId: "room-1",
      callerSubject: "tenant:alice",
      progress,
      diagnostics,
      fileAccess,
    });

    await ports[0]!.execute(
      {},
      {
        ...execContext(new AbortController().signal),
        runId: runId("loop-run"),
      },
    );

    expect(received).toMatchObject({
      workspaceRoot: "/workspace",
      workingDirectory: "/workspace/project",
      runId: "durable-run",
      roomId: "room-1",
      callerSubject: "tenant:alice",
      progress,
      diagnostics,
      fileAccess,
    });
  });

  it("preserves declared tool metadata for loop policy decisions", () => {
    const inspect = {
      name: "Inspect",
      description: "Inspect a workspace file.",
      parameters: { type: "object" as const },
      category: "read" as const,
      readOnly: true,
      destructive: false,
      aliases: ["inspect_file"],
    };
    const registry = new ToolRegistry([inspect]);

    const [port] = registryToToolPorts(registry, [inspect], {
      workspaceRoot: "/w",
      workingDirectory: "/w",
    });

    expect(port?.descriptor).toMatchObject({
      name: "Inspect",
      category: "read",
      readOnly: true,
      destructive: false,
      aliases: ["inspect_file"],
    });
  });

  it("classifies built-in tools for safety and scheduling decisions", () => {
    const registry = createAutonomousRegistry();
    const ports = registryToToolPorts(registry, registry.all(), {
      workspaceRoot: "/w",
      workingDirectory: "/w",
    });
    const descriptors = new Map(
      ports.map((port) => [port.descriptor.name, port.descriptor]),
    );

    expect(descriptors.get("Read")).toMatchObject({
      category: "read",
      readOnly: true,
      destructive: false,
      aliases: ["read_file"],
    });
    expect(descriptors.get("Glob")).toMatchObject({
      category: "read",
      readOnly: true,
      destructive: false,
      aliases: ["list_files"],
    });
    expect(descriptors.get("Grep")).toMatchObject({
      category: "read",
      readOnly: true,
      destructive: false,
      aliases: ["search_files"],
    });
    expect(descriptors.get("Bash")).toMatchObject({
      category: "process",
      readOnly: false,
      destructive: true,
      aliases: ["run_command"],
    });
    for (const name of ["Write", "Edit", "MultiEdit"]) {
      expect(descriptors.get(name)).toMatchObject({
        category: "write",
        readOnly: false,
        destructive: true,
      });
    }
  });
});

import type { JsonObject, Run, RunId } from "@domain/index.js";
import type { AgentLoopPolicy } from "@application/agent";
import type {
  ModelDelta,
  ModelMessage,
  ModelPort,
  ToolPort,
} from "@application/shared/ports/index.js";
import {
  createReactLoop,
  runReactLoop,
} from "@application/agent/execution/react-loop.js";
import type { ToolApprovalGate } from "@application/agent";
import { describe, expect, it } from "vitest";

const policy: AgentLoopPolicy = {
  maxIterations: 5,
  doomLoop: { maxRepeatedToolCalls: 3 },
  toolSelection: { allowParallelReadOnly: false },
  reminders: { enabled: false },
  compaction: { enabled: false, tokenThreshold: 100000 },
};

const run = (input: string): Run => ({
  id: "r1" as RunId,
  status: "running",
  mode: "autonomous",
  trigger: { source: "test" },
  input,
  depth: 0,
  createdAt: new Date().toISOString(),
});

function model(script: ModelDelta[][]): ModelPort {
  let turn = 0;
  return {
    async *stream() {
      const deltas = script[turn++] ?? [];
      for (const delta of deltas) yield delta;
    },
  };
}

function readTool(): ToolPort {
  return {
    descriptor: {
      name: "Read",
      description: "read",
      parameters: { type: "object" },
      category: "read",
      readOnly: true,
      destructive: false,
      aliases: [],
    },
    async execute(args: JsonObject) {
      return {
        success: true,
        content: `read ${typeof args.path === "string" ? args.path : ""}`,
        metadata: {},
      };
    },
  };
}

function writeTool(run: () => void): ToolPort {
  return {
    descriptor: {
      name: "Write",
      description: "write",
      parameters: { type: "object" },
      category: "write",
      readOnly: false,
      destructive: true,
      aliases: [],
    },
    async execute() {
      run();
      return { success: true, content: "written", metadata: {} };
    },
  };
}

describe("runReactLoop", () => {
  it("adds skill discovery before task work to caller-supplied system prompts", async () => {
    let received: readonly ModelMessage[] = [];
    await runReactLoop(
      {
        run: run("write a report"),
        policy,
        systemPrompt: "You write reports.",
        services: {
          model: {
            async *stream(request) {
              received = request.messages;
              yield { text: "done" };
            },
          },
          tools: [],
        },
      },
      new AbortController().signal,
    );

    expect(received[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining(
        "You write reports.\n\nBefore starting task work or using task tools, first use ListSkills",
      ),
    });
    expect(received[0]?.content).toContain("InvokeSkill");
  });

  it("omits plan review when the caller disables it", async () => {
    let definitions: readonly { name: string }[] = [];
    const noPlanModel: ModelPort = {
      async *stream(request) {
        definitions = request.tools ?? [];
        yield { text: "done" };
      },
    };

    const { outcome } = await runReactLoop(
      {
        run: { ...run("finish the task"), mode: "interactive" },
        policy,
        includePlanReview: false,
        services: { model: noPlanModel, tools: [] },
      },
      new AbortController().signal,
    );

    expect(definitions.map((tool) => tool.name)).not.toContain("ProposePlan");
    expect(outcome).toMatchObject({ kind: "completed", text: "done" });
  });

  it("records earlier results and pauses before an approval-gated write executes", async () => {
    let writeExecuted = false;
    const gate: ToolApprovalGate = async ({ call, tool }) => {
      if (call.id === "read") return { kind: "allow" };
      expect(call).toMatchObject({ id: "write", name: "Write" });
      expect(tool.descriptor.name).toBe("Write");
      return {
        kind: "pause",
        request: {
          approvalId: "approval-1",
          toolCallId: call.id,
          action: tool.descriptor.name,
          argumentsHash: "sha256:abc",
          preview: "report.md",
          expiresAt: "2026-09-15T00:05:00.000Z",
        },
      };
    };
    const { outcome, events } = await runReactLoop(
      {
        run: run("read then write"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "read",
                  name: "Read",
                  arguments: { path: "before.txt" },
                },
              },
              {
                toolCall: {
                  id: "write",
                  name: "Write",
                  arguments: { path: "report.md", content: "secret" },
                },
              },
            ],
          ]),
          tools: [
            readTool(),
            writeTool(() => {
              writeExecuted = true;
            }),
          ],
          approvalGate: gate,
        },
      },
      new AbortController().signal,
    );

    expect(writeExecuted).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        data: expect.objectContaining({
          id: "read",
          content: "read before.txt",
        }),
      }),
    );
    expect(outcome).toMatchObject({
      kind: "paused",
      snapshot: {
        pendingPause: {
          kind: "approval",
          request: {
            approvalId: "approval-1",
            toolCallId: "write",
            action: "Write",
            argumentsHash: "sha256:abc",
            preview: "report.md",
            expiresAt: "2026-09-15T00:05:00.000Z",
          },
        },
      },
    });
  });

  it("continues an approval snapshot by replacing its matching paused tool result", async () => {
    const requests: ModelMessage[][] = [];
    const resumedModel: ModelPort = {
      async *stream(request) {
        requests.push([...request.messages]);
        yield { text: "The approved write completed." };
      },
    };
    const snapshot = {
      version: 1 as const,
      iteration: 1,
      messages: [
        { role: "user" as const, content: "write a report" },
        {
          role: "assistant" as const,
          content: "",
          toolCalls: [
            {
              id: "write-1",
              name: "Write",
              arguments: { file_path: "report.md", content: "secret report" },
              rawArguments:
                '{"file_path":"report.md","content":"secret report"}',
            },
          ],
        },
        {
          role: "tool" as const,
          toolCallId: "write-1",
          content:
            "Tool approval requested. The run resumes after the approval decision arrives.",
        },
      ],
      pendingPause: {
        kind: "approval" as const,
        request: {
          approvalId: "approval-1",
          toolCallId: "write-1",
          action: "Write",
          argumentsHash: "sha256:abc",
          preview: "report.md",
          expiresAt: "2026-09-15T00:05:00.000Z",
        },
      },
    };
    const continuation = {
      continuation: {
        snapshot,
        toolResult: {
          toolCallId: "write-1",
          content: "write completed",
          isError: false,
        },
      },
    };

    const { outcome } = await runReactLoop(
      {
        run: run("synthetic approval resume prompt"),
        policy,
        services: { model: resumedModel, tools: [writeTool(() => undefined)] },
        ...continuation,
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      text: "The approved write completed.",
    });
    expect(requests[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          toolCalls: [
            expect.objectContaining({ id: "write-1", name: "Write" }),
          ],
        }),
        {
          role: "tool",
          toolCallId: "write-1",
          content: "write completed",
        },
      ]),
    );
    expect(requests[0]).not.toContainEqual({
      role: "user",
      content: "synthetic approval resume prompt",
    });
  });

  it("emits an interrupted terminal event when cancelled before the first turn", async () => {
    const controller = new AbortController();
    controller.abort();
    const { outcome, events } = await runReactLoop(
      {
        run: run("cancelled"),
        policy,
        services: { model: model([]), tools: [] },
      },
      controller.signal,
    );

    expect(outcome.kind).toBe("interrupted");
    expect(events.at(-1)?.type).toBe("interrupted");
  });

  it("completes when the model returns text with no tool calls", async () => {
    const { outcome, events } = await runReactLoop(
      {
        run: run("hi"),
        policy,
        services: { model: model([[{ text: "done" }]]), tools: [] },
      },
      new AbortController().signal,
    );
    expect(outcome.kind).toBe("completed");
    expect(outcome.text).toContain("done");
    expect(events.at(-1)?.type).toBe("completed");
  });

  it("executes a tool call then completes on the next turn", async () => {
    const script: ModelDelta[][] = [
      [
        {
          toolCall: {
            id: "t1",
            name: "Read",
            arguments: { path: "a.txt" },
          },
        },
      ],
      [{ text: "finished" }],
    ];
    const { outcome, events } = await runReactLoop(
      {
        run: run("read a.txt"),
        policy,
        services: { model: model(script), tools: [readTool()] },
      },
      new AbortController().signal,
    );
    expect(outcome).toMatchObject({
      kind: "completed",
      snapshot: { activatedTools: ["Read"] },
    });
    expect(events.some((e) => e.type === "tool_dispatched")).toBe(true);
  });

  /* A sentence written before the tool calls and the answer written after
     them used to stream as one run-on paragraph. */
  it("starts a new paragraph when text follows an earlier turn's text", async () => {
    const script: ModelDelta[][] = [
      [
        { text: "Looking up a.txt." },
        { toolCall: { id: "t1", name: "Read", arguments: { path: "a.txt" } } },
      ],
      [{ toolCall: { id: "t2", name: "Read", arguments: { path: "b.txt" } } }],
      [{ text: "Both files " }, { text: "are empty." }],
    ];
    const { outcome, events } = await runReactLoop(
      {
        run: run("read a.txt and b.txt"),
        policy,
        services: { model: model(script), tools: [readTool()] },
      },
      new AbortController().signal,
    );

    const streamed = events.flatMap((event) =>
      event.type === "stream_delta" ? [event.data] : [],
    );
    expect(streamed).toEqual([
      { text: "Looking up a.txt." },
      { text: "\n\n", turnBreak: true },
      { text: "Both files " },
      { text: "are empty." },
    ]);
    expect(outcome).toMatchObject({
      kind: "completed",
      text: "Looking up a.txt.\n\nBoth files are empty.",
    });
    // The break is between the messages, not inside either of them.
    expect(
      outcome.snapshot?.messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.content),
    ).toEqual(["Looking up a.txt.", "", "Both files are empty."]);
  });

  it("announces each tool call before it runs", async () => {
    let releaseTool!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseTool = resolve;
    });
    const tool: ToolPort = {
      ...readTool(),
      async execute() {
        await Promise.race([
          released,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("tool ran before it was announced")),
              2_000,
            ),
          ),
        ]);
        return { success: true, content: "read a.txt", metadata: {} };
      },
    };
    const script: ModelDelta[][] = [
      [{ toolCall: { id: "t1", name: "Read", arguments: { path: "a.txt" } } }],
      [{ text: "finished" }],
    ];
    const execution = createReactLoop().run(
      {
        run: run("read a.txt"),
        policy,
        services: { model: model(script), tools: [tool] },
      },
      new AbortController().signal,
    );

    const seen: string[] = [];
    for await (const event of execution.events) {
      seen.push(event.type);
      if (event.type === "tool_dispatched") {
        expect(event.data).toEqual({
          id: "t1",
          name: "Read",
          arguments: { path: "a.txt" },
        });
        releaseTool();
      }
    }

    expect(seen.indexOf("tool_dispatched")).toBeLessThan(
      seen.indexOf("tool_result"),
    );
    expect((await execution.outcome).kind).toBe("completed");
  });

  it("backgrounds rather than completes while a tool registers active work", async () => {
    const background: ToolPort = {
      descriptor: {
        name: "StartBackground",
        description: "start background work",
        parameters: { type: "object" },
        category: "automation",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return {
          success: true,
          content: "started",
          metadata: {
            loop_effects: [{ kind: "background_task", taskId: "task-1" }],
          },
        };
      },
    };
    const { outcome } = await runReactLoop(
      {
        run: run("start work"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "background",
                  name: "StartBackground",
                  arguments: {},
                },
              },
            ],
            [{ text: "The task is running." }],
          ]),
          tools: [background],
        },
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "backgrounded",
      snapshot: {
        backgroundTasks: [{ id: "task-1", owner: "run", status: "running" }],
      },
    });
  });

  it("restores background work from a durable loop snapshot", async () => {
    const { outcome } = await runReactLoop(
      {
        run: run("resume background work"),
        policy,
        snapshot: {
          version: 1,
          iteration: 4,
          messages: [],
          backgroundTasks: [
            { id: "research", owner: "run", status: "running" },
          ],
        },
        services: { model: model([[{ text: "Waiting." }]]), tools: [] },
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "backgrounded",
      snapshot: {
        backgroundTasks: [{ id: "research", owner: "run", status: "running" }],
      },
    });
  });

  it("nudges the model until an owned in-progress todo is completed", async () => {
    const requests: ModelMessage[][] = [];
    const todoTool = (status: "in_progress" | "completed"): ToolPort => ({
      descriptor: {
        name: status === "in_progress" ? "StartTodo" : "CompleteTodo",
        description: "update todo state",
        parameters: { type: "object" },
        category: "meta",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return {
          success: true,
          content: status,
          metadata: {
            loop_effects: [{ kind: "todo", id: "implement", status }],
          },
        };
      },
    });
    let turn = 0;
    const { outcome } = await runReactLoop(
      {
        run: run("implement it"),
        policy,
        services: {
          model: {
            async *stream(request) {
              requests.push([...request.messages]);
              const next = turn++;
              if (next === 0) {
                yield {
                  toolCall: { id: "start", name: "StartTodo", arguments: {} },
                };
              } else if (next === 1) {
                yield { text: "All done." };
              } else if (next === 2) {
                yield {
                  toolCall: {
                    id: "complete",
                    name: "CompleteTodo",
                    arguments: {},
                  },
                };
              } else {
                yield { text: "Actually complete." };
              }
            },
          },
          tools: [todoTool("in_progress"), todoTool("completed")],
        },
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      snapshot: { todos: [{ id: "implement", status: "completed" }] },
    });
    expect(requests).toHaveLength(4);
    expect(requests[2]).toContainEqual(
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("in progress"),
      }),
    );
  });

  it("fails safely instead of completing with an owned todo still in progress", async () => {
    const inProgress: ToolPort = {
      descriptor: {
        name: "StartTodo",
        description: "start work",
        parameters: { type: "object" },
        category: "meta",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return {
          success: true,
          content: "started",
          metadata: {
            loop_effects: [
              { kind: "todo", id: "implement", status: "in_progress" },
            ],
          },
        };
      },
    };
    const { outcome } = await runReactLoop(
      {
        run: run("implement it"),
        policy,
        services: {
          model: model([
            [{ toolCall: { id: "start", name: "StartTodo", arguments: {} } }],
            [{ text: "Done." }],
            [{ text: "Still done." }],
            [{ text: "Definitely done." }],
          ]),
          tools: [inProgress],
        },
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "failed",
      error: expect.stringContaining("implement"),
      snapshot: { todos: [{ id: "implement", status: "pending" }] },
    });
  });

  it("completes after a registered background task reports completion", async () => {
    const completedBackground: ToolPort = {
      descriptor: {
        name: "ObserveBackground",
        description: "record background completion",
        parameters: { type: "object" },
        category: "automation",
        readOnly: true,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return {
          success: true,
          content: "completed",
          metadata: {
            loop_effects: [
              {
                kind: "background_task",
                taskId: "task-1",
                status: "completed",
              },
            ],
          },
        };
      },
    };
    const { outcome } = await runReactLoop(
      {
        run: run("observe work"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "observe",
                  name: "ObserveBackground",
                  arguments: {},
                },
              },
            ],
            [{ text: "Background work finished." }],
          ]),
          tools: [completedBackground],
        },
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      snapshot: {
        backgroundTasks: [{ id: "task-1", status: "completed" }],
      },
    });
  });

  it("assembles fragmented tool-call arguments before dispatch", async () => {
    const seen: JsonObject[] = [];
    const tool: ToolPort = {
      ...readTool(),
      async execute(args) {
        seen.push(args);
        return { success: true, content: "read", metadata: {} };
      },
    };
    const { outcome } = await runReactLoop(
      {
        run: run("read README"),
        policy,
        services: {
          model: model([
            [
              {
                toolCallDelta: {
                  index: 0,
                  id: "fragmented",
                  name: "Read",
                  argumentsText: '{"path":',
                },
              },
              {
                toolCallDelta: { index: 0, argumentsText: '"README.md"}' },
                finishReason: "tool_calls",
              },
            ],
            [{ text: "finished" }, { finishReason: "stop" }],
          ]),
          tools: [tool],
        },
      },
      new AbortController().signal,
    );

    expect(seen).toEqual([{ path: "README.md" }]);
    expect(outcome.kind).toBe("completed");
  });

  it("repairs incomplete historical tool calls before sending a resumed transcript", async () => {
    let received: readonly ModelMessage[] = [];
    const { outcome } = await runReactLoop(
      {
        run: run("resume"),
        policy,
        history: [
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "missing", name: "Read", arguments: { path: "a" } },
            ],
          },
        ],
        services: {
          model: {
            async *stream(request) {
              received = request.messages;
              yield { text: "recovered" };
            },
          },
          tools: [],
        },
      },
      new AbortController().signal,
    );

    expect(received).toContainEqual(
      expect.objectContaining({
        role: "tool",
        toolCallId: "missing",
        content: expect.stringContaining("Not executed"),
      }),
    );
    expect(outcome.kind).toBe("completed");
  });

  it("completes on TaskStop without dispatching it as a registry tool", async () => {
    let executed = false;
    const taskStop: ToolPort = {
      descriptor: {
        name: "TaskStop",
        description: "finish the task",
        parameters: { type: "object" },
        category: "meta",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        executed = true;
        return { success: true, content: "unexpected", metadata: {} };
      },
    };
    const { outcome, events } = await runReactLoop(
      {
        run: run("finish"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "complete",
                  name: "TaskStop",
                  arguments: { result: "Task completed", status: "success" },
                },
              },
            ],
          ]),
          tools: [taskStop],
        },
      },
      new AbortController().signal,
    );

    expect(executed).toBe(false);
    expect(outcome).toMatchObject({
      kind: "completed",
      text: "Task completed",
      completionStatus: "success",
    });
    expect(events.some((event) => event.type === "tool_result")).toBe(false);
  });

  it("does not let TaskStop bypass an active owned todo", async () => {
    const todo: ToolPort = {
      descriptor: {
        name: "StartTodo",
        description: "start a todo",
        parameters: { type: "object" },
        category: "meta",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return {
          success: true,
          content: "started",
          metadata: {
            loop_effects: [
              { kind: "todo", id: "implement", status: "in_progress" },
            ],
          },
        };
      },
    };
    let calls = 0;
    const { outcome } = await runReactLoop(
      {
        run: run("finish safely"),
        policy,
        services: {
          model: {
            async *stream() {
              const turn = calls++;
              if (turn === 0) {
                yield {
                  toolCall: { id: "start", name: "StartTodo", arguments: {} },
                };
              } else if (turn === 1) {
                yield {
                  toolCall: {
                    id: "stop",
                    name: "TaskStop",
                    arguments: { result: "done" },
                  },
                };
              } else if (turn === 2) {
                yield { text: "resolved" };
              } else {
                yield { finishReason: "stop" };
              }
            },
          },
          tools: [todo],
        },
      },
      new AbortController().signal,
    );

    expect(calls).toBe(4);
    expect(outcome).toMatchObject({
      kind: "failed",
      text: "resolved",
      error: expect.stringContaining("implement"),
    });
  });

  it("returns malformed raw tool arguments to the model without executing the tool", async () => {
    let executed = false;
    const tool: ToolPort = {
      ...readTool(),
      async execute() {
        executed = true;
        return { success: true, content: "unexpected", metadata: {} };
      },
    };
    const { events } = await runReactLoop(
      {
        run: run("read"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "bad",
                  name: "Read",
                  arguments: {},
                  rawArguments: "{bad",
                },
              },
            ],
            [{ text: "recovered" }],
          ]),
          tools: [tool],
        },
      },
      new AbortController().signal,
    );

    expect(executed).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        data: expect.objectContaining({ id: "bad", isError: true }),
      }),
    );
  });

  it("does not execute tool calls from a truncated model response", async () => {
    let executed = false;
    const tool: ToolPort = {
      ...readTool(),
      async execute() {
        executed = true;
        return { success: true, content: "unexpected", metadata: {} };
      },
    };
    const { events } = await runReactLoop(
      {
        run: run("read"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "truncated",
                  name: "Read",
                  arguments: { path: "a.txt" },
                },
              },
              { finishReason: "length" },
            ],
            [{ text: "recovered" }, { finishReason: "stop" }],
          ]),
          tools: [tool],
        },
      },
      new AbortController().signal,
    );

    expect(executed).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        data: expect.objectContaining({ id: "truncated", isError: true }),
      }),
    );
  });

  it("fails with exceeded iteration limit", async () => {
    const looping: ModelDelta[][] = Array.from({ length: 10 }, () => [
      {
        toolCall: {
          id: "t",
          name: "Read",
          arguments: { path: "x" },
        },
      },
    ]);
    const { outcome } = await runReactLoop(
      {
        run: run("loop"),
        policy: { ...policy, doomLoop: { maxRepeatedToolCalls: 0 } },
        services: { model: model(looping), tools: [readTool()] },
      },
      new AbortController().signal,
    );
    expect(outcome.kind).toBe("failed");
  });

  it("trips the doom-loop detector on repeated identical calls", async () => {
    const looping: ModelDelta[][] = Array.from({ length: 10 }, () => [
      {
        toolCall: {
          id: "t",
          name: "Read",
          arguments: { path: "x" },
        },
      },
    ]);
    const { outcome, events } = await runReactLoop(
      {
        run: run("loop"),
        policy,
        services: { model: model(looping), tools: [readTool()] },
      },
      new AbortController().signal,
    );
    expect(outcome.kind).toBe("failed");
    expect(events.some((e) => e.type === "failed")).toBe(true);
  });

  it("pauses on AskUser", async () => {
    const script: ModelDelta[][] = [
      [
        {
          toolCall: {
            id: "q",
            name: "AskUser",
            arguments: {
              question: "Proceed?",
              options: [],
              allow_other: true,
            },
          },
        },
      ],
    ];
    const askUser: ToolPort = {
      descriptor: {
        name: "AskUser",
        description: "ask",
        parameters: { type: "object" },
        category: "meta",
        readOnly: true,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return { success: true, content: "", metadata: {} };
      },
    };
    const { outcome } = await runReactLoop(
      {
        run: run("ask"),
        policy,
        services: { model: model(script), tools: [askUser] },
      },
      new AbortController().signal,
    );
    expect(outcome.kind).toBe("paused");
    expect(
      (
        outcome as {
          snapshot?: {
            pendingPause?: { kind: string };
            messages: readonly unknown[];
          };
        }
      ).snapshot,
    ).toMatchObject({
      pendingPause: { kind: "question" },
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "ask" }),
      ]),
    });
  });

  it("pauses before executing calls emitted after AskUser", async () => {
    let writeExecuted = false;
    const askUser: ToolPort = {
      descriptor: {
        name: "AskUser",
        description: "ask",
        parameters: { type: "object" },
        category: "meta",
        readOnly: true,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return { success: true, content: "unexpected", metadata: {} };
      },
    };
    const write: ToolPort = {
      descriptor: {
        name: "Write",
        description: "write",
        parameters: { type: "object" },
        category: "write",
        readOnly: false,
        destructive: true,
        aliases: [],
      },
      async execute() {
        writeExecuted = true;
        return { success: true, content: "unexpected", metadata: {} };
      },
    };
    const { outcome, events } = await runReactLoop(
      {
        run: run("ask"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "question",
                  name: "AskUser",
                  arguments: { question: "Proceed?" },
                },
              },
              { toolCall: { id: "write", name: "Write", arguments: {} } },
            ],
          ]),
          tools: [askUser, write],
        },
      },
      new AbortController().signal,
    );

    expect(outcome.kind).toBe("paused");
    expect(writeExecuted).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: "paused" }));
    const snapshot = (
      outcome as { snapshot?: { messages: readonly ModelMessage[] } }
    ).snapshot;
    expect(snapshot?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          toolCalls: expect.arrayContaining([
            expect.objectContaining({ id: "question", name: "AskUser" }),
            expect.objectContaining({ id: "write", name: "Write" }),
          ]),
        }),
        expect.objectContaining({
          role: "tool",
          toolCallId: "question",
          content:
            "Question delivered to the user. Their answer arrives as the next message.",
        }),
        expect.objectContaining({
          role: "tool",
          toolCallId: "write",
          content: expect.stringContaining("Not executed"),
        }),
      ]),
    );
  });

  it("resets an owned in-progress todo when a later AskUser call pauses", async () => {
    const startTodo: ToolPort = {
      descriptor: {
        name: "StartTodo",
        description: "start a todo",
        parameters: { type: "object" },
        category: "meta",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return {
          success: true,
          content: "started",
          metadata: {
            loop_effects: [
              { kind: "todo", id: "implement", status: "in_progress" },
            ],
          },
        };
      },
    };
    const askUser: ToolPort = {
      descriptor: {
        name: "AskUser",
        description: "ask",
        parameters: { type: "object" },
        category: "meta",
        readOnly: true,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return { success: true, content: "unexpected", metadata: {} };
      },
    };
    const { outcome } = await runReactLoop(
      {
        run: run("ask"),
        policy,
        services: {
          model: model([
            [
              { toolCall: { id: "start", name: "StartTodo", arguments: {} } },
              {
                toolCall: {
                  id: "question",
                  name: "AskUser",
                  arguments: { question: "Proceed?" },
                },
              },
            ],
          ]),
          tools: [startTodo, askUser],
        },
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "paused",
      snapshot: {
        todos: [{ id: "implement", status: "pending", owner: "run" }],
      },
    });
  });

  it("resets an owned in-progress todo when the run is interrupted", async () => {
    const controller = new AbortController();
    const startTodo: ToolPort = {
      descriptor: {
        name: "StartTodo",
        description: "start a todo",
        parameters: { type: "object" },
        category: "meta",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        controller.abort();
        return {
          success: true,
          content: "started",
          metadata: {
            loop_effects: [
              { kind: "todo", id: "implement", status: "in_progress" },
            ],
          },
        };
      },
    };
    const { outcome } = await runReactLoop(
      {
        run: run("interrupt"),
        policy,
        services: {
          model: model([
            [{ toolCall: { id: "start", name: "StartTodo", arguments: {} } }],
          ]),
          tools: [startTodo],
        },
      },
      controller.signal,
    );

    expect(outcome).toMatchObject({
      kind: "interrupted",
      snapshot: {
        todos: [{ id: "implement", status: "pending", owner: "run" }],
      },
    });
  });

  it("resets an owned in-progress todo when the next model turn fails", async () => {
    const startTodo: ToolPort = {
      descriptor: {
        name: "StartTodo",
        description: "start a todo",
        parameters: { type: "object" },
        category: "meta",
        readOnly: false,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return {
          success: true,
          content: "started",
          metadata: {
            loop_effects: [
              { kind: "todo", id: "implement", status: "in_progress" },
            ],
          },
        };
      },
    };
    let turn = 0;
    const { outcome } = await runReactLoop(
      {
        run: run("fail"),
        policy,
        services: {
          model: {
            async *stream() {
              if (turn++ === 0) {
                yield {
                  toolCall: { id: "start", name: "StartTodo", arguments: {} },
                };
                return;
              }
              throw new Error("provider unavailable");
            },
          },
          tools: [startTodo],
        },
      },
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: "failed",
      error: "provider unavailable",
      snapshot: {
        todos: [{ id: "implement", status: "pending", owner: "run" }],
      },
    });
  });

  it("pauses for a valid ProposePlan and stubs the remaining calls", async () => {
    let writeExecuted = false;
    const { outcome } = await runReactLoop(
      {
        run: { ...run("review plan"), mode: "interactive" },
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "plan",
                  name: "ProposePlan",
                  arguments: {
                    summary: "Update the report",
                    steps: [
                      {
                        tool_name: "Write",
                        arguments: { file_path: "report.md" },
                        rationale: "Create the requested report.",
                      },
                    ],
                  },
                },
              },
              { toolCall: { id: "write", name: "Write", arguments: {} } },
            ],
          ]),
          tools: [
            writeTool(() => {
              writeExecuted = true;
            }),
          ],
        },
      },
      new AbortController().signal,
    );

    expect(writeExecuted).toBe(false);
    expect(outcome).toMatchObject({
      kind: "paused",
      snapshot: {
        pendingPause: {
          kind: "plan",
          request: {
            summary: "Update the report",
            steps: [
              {
                toolName: "Write",
                arguments: { file_path: "report.md" },
                rationale: "Create the requested report.",
              },
            ],
          },
        },
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            toolCallId: "plan",
            content: expect.stringContaining("Plan delivered"),
          }),
          expect.objectContaining({
            role: "tool",
            toolCallId: "write",
            content: expect.stringContaining("Not executed"),
          }),
        ]),
      },
    });
  });

  it("pauses for a configured client tool before dispatching later calls", async () => {
    let writeExecuted = false;
    const { outcome } = await runReactLoop(
      {
        run: { ...run("preview"), mode: "interactive" },
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "preview",
                  name: "RenderPreview",
                  arguments: { markdown: "# Draft" },
                },
              },
              { toolCall: { id: "write", name: "Write", arguments: {} } },
            ],
          ]),
          tools: [
            writeTool(() => {
              writeExecuted = true;
            }),
          ],
          clientTools: [
            {
              name: "RenderPreview",
              description: "Render markdown in the client.",
              parameters: { type: "object" },
            },
          ],
        },
      },
      new AbortController().signal,
    );

    expect(writeExecuted).toBe(false);
    expect(outcome).toMatchObject({
      kind: "paused",
      snapshot: {
        pendingPause: {
          kind: "client_tool",
          request: {
            id: "preview",
            name: "RenderPreview",
            arguments: { markdown: "# Draft" },
          },
        },
      },
    });
  });

  it("executes calls emitted before AskUser before pausing", async () => {
    const askUser: ToolPort = {
      descriptor: {
        name: "AskUser",
        description: "ask",
        parameters: { type: "object" },
        category: "meta",
        readOnly: true,
        destructive: false,
        aliases: [],
      },
      async execute() {
        return { success: true, content: "unexpected", metadata: {} };
      },
    };
    const { outcome, events } = await runReactLoop(
      {
        run: run("inspect then ask"),
        policy,
        services: {
          model: model([
            [
              {
                toolCall: {
                  id: "read",
                  name: "Read",
                  arguments: { path: "before.txt" },
                },
              },
              {
                toolCall: {
                  id: "question",
                  name: "AskUser",
                  arguments: { question: "Proceed?" },
                },
              },
            ],
          ]),
          tools: [readTool(), askUser],
        },
      },
      new AbortController().signal,
    );

    expect(outcome.kind).toBe("paused");
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        data: expect.objectContaining({
          id: "read",
          content: "read before.txt",
        }),
      }),
    );
    const messages = (
      outcome as { snapshot?: { messages: readonly ModelMessage[] } }
    ).snapshot?.messages;
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "tool",
          toolCallId: "read",
          content: "read before.txt",
        }),
        expect.objectContaining({
          role: "tool",
          toolCallId: "question",
          content: expect.stringContaining("Question delivered"),
        }),
      ]),
    );
  });

  it("returns interrupted when aborted before start", async () => {
    const controller = new AbortController();
    controller.abort();
    const { outcome } = await runReactLoop(
      {
        run: run("x"),
        policy,
        services: { model: model([[{ text: "unused" }]]), tools: [] },
      },
      controller.signal,
    );
    expect(outcome.kind).toBe("interrupted");
  });
});

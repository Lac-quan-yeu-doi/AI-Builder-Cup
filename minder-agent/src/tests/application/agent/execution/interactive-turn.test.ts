import type {
  ChatCompletionGateway,
  ChatCompletionRequest,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { InMemorySessionStore } from "@application/session";
import {
  createInteractiveRegistry,
  ToolRegistry,
  type ToolContext,
} from "@infrastructure/tools/core";
import type { AgentEvent, RunOutcome } from "@domain/shared";
import type { ToolApprovalGate } from "@application/agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  INTERACTIVE_SYSTEM_PROMPT,
  NativeAgentController,
  streamInteractiveTurn,
} from "@application/agent";
import type { AgentLoop } from "@application/agent";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "key",
  model: "m",
};
const context: ToolContext = {
  workspaceRoot: process.cwd(),
  workingDirectory: process.cwd(),
  signal: new AbortController().signal,
};

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

describe("streamInteractiveTurn", () => {
  /* The three tool events used to leave together once the tool had returned,
     so a consumer showing "running" only ever saw it for an instant. */
  it("reports a tool as started before it runs", async () => {
    let releaseTool!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseTool = resolve;
    });
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
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: { id: "call_1", name: "Inspect", arguments: "{}" },
        },
      ],
      [{ type: "text", text: "Done." }],
    ]);
    const sessions = new InMemorySessionStore();
    const turn = streamInteractiveTurn({
      config,
      gateway,
      session: sessions.create(),
      sessionStore: sessions,
      registry,
      context,
      prompt: "inspect",
      signal: new AbortController().signal,
    });

    const seen: string[] = [];
    for (let next = await turn.next(); !next.done; next = await turn.next()) {
      seen.push(next.value.type);
      if (next.value.type === "tool_started") {
        expect(next.value.data).toEqual({
          id: "call_1",
          name: "Inspect",
          arguments: {},
        });
        releaseTool();
      }
    }

    expect(seen).toEqual([
      "tool_started",
      "tool_finished",
      "tool_result",
      "text",
      "done",
    ]);
  });

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
    const sessions = new InMemorySessionStore();
    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway: scriptedGateway([[]]),
        session: sessions.create(),
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "run through the injected loop",
        signal: new AbortController().signal,
        loop,
      }),
    );

    expect(calls).toBe(1);
    expect(result.outcome).toMatchObject({ status: "completed", text: "" });
  });

  it("does not inject a follow-up message when an interactive response is empty", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const gateway = scriptedGateway([[]]);

    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "hello",
        signal: new AbortController().signal,
      }),
    );

    expect(result.outcome).toMatchObject({ status: "completed", text: "" });
    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0]?.messages).toHaveLength(2);
  });

  it("emits a redacted approval event before dispatching a write", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "minder-interactive-approval-"),
    );
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const approvalGate: ToolApprovalGate = async ({ call, tool }) => ({
      kind: "pause",
      request: {
        approvalId: "approval-1",
        toolCallId: call.id,
        action: tool.descriptor.name,
        argumentsHash: "sha256:abc",
        preview: "report.md",
        expiresAt: "2026-09-15T00:05:00.000Z",
      },
    });
    try {
      const result = await collect(
        streamInteractiveTurn({
          config,
          gateway: scriptedGateway([
            [
              {
                type: "tool_call",
                call: {
                  id: "write_1",
                  name: "Write",
                  arguments: JSON.stringify({
                    file_path: "report.md",
                    content: "secret write body",
                  }),
                },
              },
            ],
          ]),
          session,
          sessionStore: sessions,
          registry: createInteractiveRegistry(),
          context: {
            workspaceRoot,
            workingDirectory: workspaceRoot,
            signal: new AbortController().signal,
          },
          prompt: "write a report",
          signal: new AbortController().signal,
          approvalGate,
        }),
      );

      expect(result.events).toEqual([
        {
          type: "awaiting_approval",
          data: {
            approval_id: "approval-1",
            action: "Write",
            preview: "report.md",
            expires_at: "2026-09-15T00:05:00.000Z",
          },
        },
        { type: "done", data: { response_text: "" } },
      ]);
      expect(JSON.stringify(result.events)).not.toContain("secret write body");
      expect(result.outcome).toMatchObject({
        status: "completed",
        loopSnapshot: { pendingPause: { kind: "approval" } },
      });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("continues an approved snapshot without persisting or publishing raw tool arguments", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "minder-interactive-approved-resume-"),
    );
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const rawArguments = "secret write body";
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "write_1",
            name: "Write",
            arguments: JSON.stringify({
              file_path: "report.md",
              content: rawArguments,
            }),
          },
        },
      ],
      [{ type: "text", text: "The approved write completed." }],
    ]);
    const approvalGate: ToolApprovalGate = async ({ call, tool }) => ({
      kind: "pause",
      request: {
        approvalId: "approval-1",
        toolCallId: call.id,
        action: tool.descriptor.name,
        argumentsHash: "sha256:abc",
        preview: "report.md",
        expiresAt: "2026-09-15T00:05:00.000Z",
      },
    });
    try {
      const paused = await collect(
        streamInteractiveTurn({
          config,
          gateway,
          session,
          sessionStore: sessions,
          registry: createInteractiveRegistry(),
          context: {
            workspaceRoot,
            workingDirectory: workspaceRoot,
            signal: new AbortController().signal,
          },
          prompt: "write a report",
          signal: new AbortController().signal,
          approvalGate,
        }),
      );
      const continuation = {
        continuation: {
          snapshot: paused.outcome.loopSnapshot!,
          toolResult: {
            toolCallId: "write_1",
            content: "write completed",
            isError: false,
          },
        },
      };

      const resumed = await collect(
        streamInteractiveTurn({
          config,
          gateway,
          session: sessions.get(session.id)!,
          sessionStore: sessions,
          registry: createInteractiveRegistry(),
          context: {
            workspaceRoot,
            workingDirectory: workspaceRoot,
            signal: new AbortController().signal,
          },
          signal: new AbortController().signal,
          ...continuation,
        }),
      );

      expect(resumed.outcome).toMatchObject({
        status: "completed",
        text: "The approved write completed.",
      });
      expect(gateway.requests[1]?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "assistant",
            tool_calls: [
              expect.objectContaining({
                id: "write_1",
                function: expect.objectContaining({ name: "Write" }),
              }),
            ],
          }),
          {
            role: "tool",
            name: "Write",
            tool_call_id: "write_1",
            content: "write completed",
          },
        ]),
      );
      expect(
        gateway.requests[1]?.messages.filter(
          (message) => message.role === "user",
        ),
      ).toEqual([{ role: "user", content: "write a report" }]);
      expect(JSON.stringify(sessions.get(session.id)?.history)).not.toContain(
        rawArguments,
      );
      expect(
        JSON.stringify([...paused.events, ...resumed.events]),
      ).not.toContain(rawArguments);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("synchronizes the durable workspace after a successful write", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "minder-interactive-sync-"),
    );
    const syncWorkspace = vi.fn(async () => undefined);
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "write_1",
            name: "Write",
            arguments: JSON.stringify({
              file_path: "report.md",
              content: "report",
            }),
          },
        },
      ],
      [{ type: "text", text: "done" }],
    ]);
    try {
      const result = await collect(
        streamInteractiveTurn({
          config,
          gateway,
          session,
          sessionStore: sessions,
          registry: createInteractiveRegistry(),
          context: {
            workspaceRoot,
            workingDirectory: workspaceRoot,
            signal: new AbortController().signal,
            syncWorkspace,
          },
          prompt: "write a report",
          signal: new AbortController().signal,
        }),
      );

      expect(result.outcome.status).toBe("completed");
      expect(syncWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("reports workspace sync failure for a successful Bash command", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "bash_1",
            name: "Bash",
            arguments: JSON.stringify({ command: "echo report > report.pdf" }),
          },
        },
      ],
      [{ type: "text", text: "The report was not delivered." }],
    ]);
    const base = createInteractiveRegistry();
    const registry = base.withTools([
      ...base.all().filter((tool) => tool.name !== "Bash"),
      {
        name: "Bash",
        description: "Run a workspace command.",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
        },
        readOnly: false,
        async execute() {
          return {
            success: true,
            output: "command exited successfully",
            metadata: { exit_code: 0 },
          };
        },
      },
    ]);
    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry,
        context: {
          ...context,
          syncWorkspace: async () => {
            throw new Error("object store unavailable");
          },
        },
        prompt: "create a PDF report",
        signal: new AbortController().signal,
      }),
    );

    expect(result.outcome.status).toBe("completed");
    const toolMessage = gateway.requests[1]?.messages.find(
      (message) => message.role === "tool",
    );
    expect(toolMessage?.content).toContain("Workspace synchronization failed");
    expect(toolMessage?.content).not.toContain("report.pdf");
  });

  it("sends interactive tools and persists assistant history", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const gateway = scriptedGateway([[{ type: "text", text: "hello" }]]);
    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "say hello",
        signal: new AbortController().signal,
      }),
    );

    expect(result.events).toEqual([
      { type: "text", data: "hello" },
      { type: "done", data: { response_text: "hello" } },
    ]);
    expect(result.outcome).toMatchObject({
      status: "completed",
      text: "hello",
      loopSnapshot: { version: 1 },
    });
    expect(gateway.requests[0]).toMatchObject({
      messages: [
        {
          role: "system",
          content: expect.stringContaining(INTERACTIVE_SYSTEM_PROMPT),
        },
        { role: "user", content: "say hello" },
      ],
      tools: expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "Read" }),
        }),
        expect.objectContaining({
          function: expect.objectContaining({ name: "AskUser" }),
        }),
      ]),
      tool_choice: "auto",
    });
    expect(sessions.get(session.id)?.history).toEqual([
      { role: "user", content: "say hello" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("streams the answer after a tool round as a new paragraph", async () => {
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
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway: scriptedGateway([
          [
            { type: "text", text: "I'll inspect the workspace." },
            {
              type: "tool_call",
              call: { id: "call_1", name: "Inspect", arguments: "{}" },
            },
          ],
          [{ type: "text", text: "It is empty." }],
        ]),
        session,
        sessionStore: sessions,
        registry,
        context,
        prompt: "inspect",
        signal: new AbortController().signal,
      }),
    );

    expect(
      result.events.flatMap((event) =>
        event.type === "text" ? [event.data] : [],
      ),
    ).toEqual(["I'll inspect the workspace.", "\n\n", "It is empty."]);
    expect(result.events.at(-1)).toEqual({
      type: "done",
      data: { response_text: "I'll inspect the workspace.\n\nIt is empty." },
    });
    expect(
      sessions
        .get(session.id)
        ?.history.filter((message) => message.role === "assistant")
        .map((message) => message.content),
    ).toEqual(["I'll inspect the workspace.", "It is empty."]);
  });

  it("executes a tool before requesting the next model turn", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "call_1",
            name: "Read",
            arguments: '{"file_path":"README.md"}',
            extraContent: {
              google: { thought_signature: "opaque-signature" },
            },
          },
        },
      ],
      [{ type: "text", text: "I read it." }],
    ]);
    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "read the README",
        signal: new AbortController().signal,
      }),
    );

    expect(result.events.map((event) => event.type)).toEqual([
      "tool_started",
      "tool_finished",
      "tool_result",
      "text",
      "done",
    ]);
    expect(result.events[2]).toMatchObject({
      type: "tool_result",
      data: { id: "call_1", name: "Read", is_error: false },
    });
    expect(gateway.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
    });
    expect(gateway.requests[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          tool_calls: [
            expect.objectContaining({
              extra_content: {
                google: { thought_signature: "opaque-signature" },
              },
            }),
          ],
        }),
      ]),
    );
  });

  it("pauses on AskUser and resumes with a validated choice", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "question_1",
            name: "AskUser",
            arguments: JSON.stringify({
              question: "Which database?",
              options: ["Postgres", "SQLite"],
              allow_other: false,
            }),
          },
        },
      ],
      [{ type: "text", text: "Using Postgres." }],
    ]);
    const first = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "choose storage",
        signal: new AbortController().signal,
      }),
    );
    expect(first.events).toEqual([
      {
        type: "awaiting_input",
        data: {
          version: 1,
          kind: "choice",
          question: "Which database?",
          options: [{ label: "Postgres" }, { label: "SQLite" }],
          allow_other: false,
        },
      },
      { type: "done", data: { response_text: "" } },
    ]);
    expect(sessions.get(session.id)?.pendingQuestion?.question).toBe(
      "Which database?",
    );
    expect(
      (first.outcome as { loopSnapshot?: { pendingPause?: { kind: string } } })
        .loopSnapshot,
    ).toMatchObject({
      pendingPause: { kind: "question" },
    });

    const resumed = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session: sessions.get(session.id)!,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "Postgres",
        signal: new AbortController().signal,
      }),
    );
    expect(resumed.outcome).toMatchObject({
      status: "completed",
      text: "Using Postgres.",
      loopSnapshot: { version: 1 },
    });
    expect(resumed.events.at(-1)).toEqual({
      type: "done",
      data: { response_text: "Using Postgres." },
    });
    expect(sessions.get(session.id)?.pendingQuestion).toBeUndefined();
    expect(
      gateway.requests[1]?.messages.map((message) => message.content),
    ).toEqual(expect.arrayContaining(["choose storage", "Postgres"]));
    expect(gateway.requests[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          tool_calls: expect.arrayContaining([
            expect.objectContaining({
              id: "question_1",
              type: "function",
              function: expect.objectContaining({ name: "AskUser" }),
            }),
          ]),
        }),
        expect.objectContaining({
          role: "tool",
          tool_call_id: "question_1",
          content: expect.stringContaining("Question delivered"),
        }),
      ]),
    );
  });

  it("emits a plan-review pause before dispatching proposed work", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway: scriptedGateway([
          [
            {
              type: "tool_call",
              call: {
                id: "plan_1",
                name: "ProposePlan",
                arguments: JSON.stringify({
                  summary: "Update the report",
                  steps: [
                    {
                      tool_name: "Write",
                      arguments: { file_path: "report.md" },
                      rationale: "Create the requested report.",
                    },
                  ],
                }),
              },
            },
          ],
        ]),
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "prepare a report",
        signal: new AbortController().signal,
      }),
    );

    expect(result.events).toEqual([
      {
        type: "awaiting_plan",
        data: {
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
      { type: "done", data: { response_text: "" } },
    ]);
    expect(result.outcome).toMatchObject({
      status: "completed",
      loopSnapshot: { pendingPause: { kind: "plan" } },
    });
  });

  it("emits a client-tool pause with the model call intact", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway: scriptedGateway([
          [
            {
              type: "tool_call",
              call: {
                id: "preview_1",
                name: "RenderPreview",
                arguments: '{"markdown":"# Draft"}',
              },
            },
          ],
        ]),
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "preview this",
        signal: new AbortController().signal,
        clientTools: [
          {
            name: "RenderPreview",
            description: "Render markdown in the client.",
            parameters: { type: "object" },
          },
        ],
      }),
    );

    expect(result.events).toEqual([
      {
        type: "awaiting_client_tool",
        data: {
          id: "preview_1",
          name: "RenderPreview",
          arguments: { markdown: "# Draft" },
        },
      },
      { type: "done", data: { response_text: "" } },
    ]);
    expect(result.outcome).toMatchObject({
      status: "completed",
      loopSnapshot: { pendingPause: { kind: "client_tool" } },
    });
  });

  it("continues with queued steering after a tool round", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const controller = new NativeAgentController();
    controller.steer("Use only the README result.");
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "call_1",
            name: "Read",
            arguments: '{"file_path":"README.md"}',
          },
        },
      ],
      [{ type: "text", text: "Done." }],
    ]);

    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "read the README",
        signal: new AbortController().signal,
        controller,
      }),
    );

    expect(result.outcome).toMatchObject({
      status: "completed",
      text: "Done.",
      loopSnapshot: { version: 1 },
    });
    expect(gateway.requests[1]?.messages.at(-1)).toEqual({
      role: "user",
      content: "Use only the README result.",
    });
  });

  it("continues with queued follow-up instead of ending the turn", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const controller = new NativeAgentController();
    controller.followUp("Summarize that in one line.");
    const gateway = scriptedGateway([
      [{ type: "text", text: "A detailed answer." }],
      [{ type: "text", text: "One-line summary." }],
    ]);

    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "answer",
        signal: new AbortController().signal,
        controller,
      }),
    );

    expect(
      result.events.flatMap((event) =>
        event.type === "text" ? [event.data] : [],
      ),
    ).toEqual(["A detailed answer.", "\n\n", "One-line summary."]);
    expect(result.outcome).toMatchObject({
      status: "completed",
      text: "A detailed answer.\n\nOne-line summary.",
      loopSnapshot: { version: 1 },
    });
    expect(gateway.requests[1]?.messages.at(-1)).toEqual({
      role: "user",
      content: "Summarize that in one line.",
    });
  });

  it("persists live TodoWrite and TaskUpdate state in the terminal snapshot", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const gateway = scriptedGateway([
      [
        {
          type: "tool_call",
          call: {
            id: "todos",
            name: "TodoWrite",
            arguments: JSON.stringify({
              todos: [
                {
                  id: "implement",
                  content: "Implement durable resume",
                  status: "in_progress",
                },
              ],
            }),
          },
        },
      ],
      [
        {
          type: "tool_call",
          call: {
            id: "complete",
            name: "TaskUpdate",
            arguments: JSON.stringify({
              id: "implement",
              status: "completed",
            }),
          },
        },
      ],
      [{ type: "text", text: "Done." }],
    ]);

    const result = await collect(
      streamInteractiveTurn({
        config,
        gateway,
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "implement durable resume",
        signal: new AbortController().signal,
      }),
    );

    expect(result.outcome).toMatchObject({
      status: "completed",
      text: "Done.",
      loopSnapshot: {
        todos: [
          {
            id: "implement",
            content: "Implement durable resume",
            status: "completed",
            owner: "run",
          },
        ],
      },
    });
  });

  it("emits done for invalid input and interruption outcomes", async () => {
    const sessions = new InMemorySessionStore();
    const session = sessions.create();
    const blank = await collect(
      streamInteractiveTurn({
        config,
        gateway: scriptedGateway([]),
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "  ",
        signal: new AbortController().signal,
      }),
    );
    expect(blank.events).toEqual([
      { type: "done", data: { response_text: "" } },
    ]);
    expect(blank.outcome.status).toBe("failed");

    const controller = new AbortController();
    controller.abort();
    const interrupted = await collect(
      streamInteractiveTurn({
        config,
        gateway: scriptedGateway([]),
        session,
        sessionStore: sessions,
        registry: createInteractiveRegistry(),
        context,
        prompt: "continue",
        signal: controller.signal,
      }),
    );
    expect(interrupted.events).toEqual([
      { type: "done", data: { response_text: "" } },
    ]);
    expect(interrupted.outcome.status).toBe("interrupted");
  });
});

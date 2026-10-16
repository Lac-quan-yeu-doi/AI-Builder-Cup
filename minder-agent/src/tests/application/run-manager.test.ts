import type {
  ChatCompletionGateway,
  ChatCompletionRequest,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { createPrincipalScope, principalScopeKey } from "@domain/index.js";
import {
  createMemoryS3WorkspaceStorage,
  createS3WorkspaceProvider,
} from "@infrastructure/workspace";
import { ToolRegistry } from "@infrastructure/tools/core";
import { createRuntimeToolRegistries } from "@infrastructure/tools/impl";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import {
  InMemoryRunManager as RuntimeInMemoryRunManager,
  InMemoryRuntimeStore,
  RuntimeRunManager,
  type InMemoryRunManagerOptions,
} from "@application/runtime";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

type RuntimeRunWithManifestOwner = { readonly manifestOwner?: string };

class InMemoryRunManager extends RuntimeInMemoryRunManager {
  constructor(
    options: Omit<InMemoryRunManagerOptions, "sha256"> & {
      readonly sha256?: typeof sha256;
    },
  ) {
    super({ ...options, sha256: options.sha256 ?? sha256 });
  }
}

function gateway(
  scripts: readonly (readonly ModelStreamEvent[])[],
): ChatCompletionGateway {
  let index = 0;
  return {
    async *stream() {
      yield* scripts[index++] ?? [];
    },
  };
}

async function waitFor(
  manager: InMemoryRunManager,
  runId: string,
  terminal = true,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = manager.store.getRun(runId)!;
    if (
      !terminal ||
      [
        "awaiting_input",
        "awaiting_client_tool",
        "awaiting_plan_confirmation",
        "backgrounded",
        "completed",
        "failed",
        "interrupted",
      ].includes(run.status)
    )
      return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("run did not finish");
}

describe("InMemoryRunManager", () => {
  it("includes automation context in autonomous model prompts", async () => {
    const requests: ChatCompletionRequest[] = [];
    const manager = new InMemoryRunManager({
      config,
      gateway: {
        async *stream(request) {
          requests.push(request);
          yield { type: "text", text: "done" };
        },
      },
    });
    const admission = await manager.start({
      key: "hook:context",
      input: "run workflow",
      owner: "alice",
      mode: "autonomous",
      trigger: { source: "webhook" },
      context: {
        kind: "automation-workflow",
        workflowName: "Quarterly report",
        topicOptions: ["analytics"],
      },
    });
    if (admission.kind !== "started") throw new Error("expected start");
    await waitFor(manager, admission.run.id);

    expect(JSON.stringify(requests[0]?.messages)).toContain("Quarterly report");
    expect(JSON.stringify(requests[0]?.messages)).toContain("analytics");
  });

  it("journals live tool progress emitted by a run tool", async () => {
    const manager = new InMemoryRunManager({
      config,
      registry: new ToolRegistry([
        {
          name: "ProgressProbe",
          description: "emit a progress update",
          parameters: { type: "object", additionalProperties: false },
          readOnly: true,
          async execute(_args, context) {
            await context.progress?.report("Running progress probe");
            return { success: true, output: "complete", metadata: {} };
          },
        },
      ]),
      gateway: gateway([
        [
          {
            type: "tool_call",
            call: { id: "progress-1", name: "ProgressProbe", arguments: "{}" },
          },
        ],
        [{ type: "text", text: "complete" }],
      ]),
    });
    const admission = await manager.start({
      key: "chat:tool-progress",
      input: "show the workspace",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected start");

    await waitFor(manager, admission.run.id);

    const events = manager
      .replay(admission.run.id, 0, 512)
      .map((event) => event.payload);
    expect(events.map((event) => event.type)).toContain("tool_progress");
    expect(
      events.find((event) => event.type === "tool_progress"),
    ).toMatchObject({
      type: "tool_progress",
      data: {
        kind: "progress",
        payload: { message: "Running progress probe" },
      },
    });
  });

  it("journals a workspace change after a successful mutable tool action", async () => {
    let executed = false;
    const registry = new ToolRegistry([
      {
        name: "Write",
        description: "write a workspace file",
        parameters: {
          type: "object",
          properties: { file_path: { type: "string" } },
          required: ["file_path"],
          additionalProperties: false,
        },
        readOnly: false,
        destructive: true,
        async execute(args) {
          executed = true;
          return {
            success: true,
            output: "written",
            metadata: { path: args.file_path as string },
          };
        },
      },
    ]);
    const manager = new InMemoryRunManager({
      config,
      registry,
      runtimeGovernanceDefaults: { autoApprovals: ["Write"] },
      gateway: gateway([
        [
          {
            type: "tool_call",
            call: {
              id: "write-1",
              name: "Write",
              arguments: '{"file_path":"report.md"}',
            },
          },
        ],
        [{ type: "text", text: "complete" }],
      ]),
    });
    const admission = await manager.start({
      key: "chat:workspace-events",
      input: "write the report",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected start");

    await waitFor(manager, admission.run.id);
    expect(executed).toBe(true);

    expect(
      manager
        .replay(admission.run.id, 0, 512)
        .map((event) => event.payload)
        .filter((event) => event.type === "workspace_changed"),
    ).toEqual([
      {
        type: "workspace_changed",
        data: { changes: [{ rel_path: "report.md", kind: "modified" }] },
      },
    ]);
  });

  it("runs room agents in the resolved S3 workspace rather than the application directory", async () => {
    const cache = await mkdtemp(join(tmpdir(), "minder-runtime-workspace-"));
    const workspaceProvider = createS3WorkspaceProvider({
      storage: createMemoryS3WorkspaceStorage(),
      cacheDirectory: cache,
    });
    let observedWorkspace: string | undefined;
    const registry = new ToolRegistry([
      {
        name: "ProbeWorkspace",
        description: "Record the active workspace.",
        parameters: { type: "object", additionalProperties: false },
        readOnly: true,
        async execute(_args, context) {
          observedWorkspace = context.workspaceRoot;
          return { success: true, output: "recorded", metadata: {} };
        },
      },
    ]);
    try {
      const expected = await workspaceProvider.resolve(
        "tenant-a-org-a-alice",
        "room:room-one:agent:writer",
      );
      const manager = new InMemoryRunManager({
        config,
        registry,
        gateway: gateway([
          [
            {
              type: "tool_call",
              call: {
                id: "probe",
                name: "ProbeWorkspace",
                arguments: "{}",
              },
            },
          ],
          [{ type: "text", text: "complete" }],
        ]),
        workspaceProvider,
      });
      const admission = await manager.start({
        key: "room:room-one:agent:writer",
        input: "probe the workspace",
        owner: "tenant-a-org-a-alice",
        mode: "interactive",
        trigger: { source: "room" },
      });
      if (admission.kind !== "started") throw new Error("expected start");
      await waitFor(manager, admission.run.id);

      expect(observedWorkspace).toBe(expected.root);
      expect(observedWorkspace).not.toBe(process.cwd());
    } finally {
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("rehydrates a durable loop snapshot before continuing a session", async () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession("alice", "durable", "interactive");
    store.saveLoopSnapshot(session.id, {
      version: 1,
      iteration: 1,
      messages: [],
      backgroundTasks: [{ id: "research", owner: "run", status: "running" }],
    });
    const manager = new InMemoryRunManager({
      config,
      store,
      gateway: gateway([[{ type: "text", text: "Still running." }]]),
    });

    const admission = await manager.start({
      key: "durable",
      input: "check progress",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected start");

    expect((await waitFor(manager, admission.run.id)).status).toBe(
      "backgrounded",
    );
    expect(store.getLoopSnapshot(session.id)).toMatchObject({
      backgroundTasks: [{ id: "research", owner: "run", status: "running" }],
    });
  });

  it("dispatches and journals a caller-scoped interactive run", async () => {
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "hello" }]]),
    });
    const admission = await manager.start({
      key: "chat:one",
      input: "say hello",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    expect(admission.kind).toBe("started");
    if (admission.kind !== "started") return;
    const run = await waitFor(manager, admission.run.id);
    expect(run.status).toBe("completed");
    expect(
      manager.replay(run.id, 0, 512).map((event) => event.payload.type),
    ).toEqual(["text", "done"]);
    expect(manager.getSessionByKey("chat:one", "alice")?.turns).toBe(1);
    expect(manager.getAuthorizedRun(run.id, "bob")).toBeUndefined();
  });

  it("admits a queued run and dispatches it exactly once", async () => {
    const debugEntries: string[] = [];
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "queued response" }]]),
      debugLog: (entry) => debugEntries.push(entry),
    });
    const input = {
      key: "room:one:agent:writer",
      input: "wait for room admission",
      owner: "alice",
      mode: "interactive" as const,
      trigger: { source: "room" },
      requestId: "queued-request-1",
    };

    const admission = await manager.admitQueued(input);
    if (admission.kind !== "started") throw new Error("expected queued run");
    expect(admission.run.status).toBe("queued");
    expect(manager.replay(admission.run.id, 0, 10)).toEqual([]);

    expect(await manager.dispatchQueued(admission.run.id, "alice")).toBe(true);
    expect(await manager.dispatchQueued(admission.run.id, "alice")).toBe(false);
    expect((await waitFor(manager, admission.run.id)).status).toBe("completed");
    expect(debugEntries).toContainEqual(
      expect.stringContaining('"requestId":"queued-request-1"'),
    );
  });

  it("dispatches a queued organization manifest run in production", async () => {
    const cache = await mkdtemp(join(tmpdir(), "minder-runtime-queued-"));
    const workspaceProvider = createS3WorkspaceProvider({
      storage: createMemoryS3WorkspaceStorage(),
      cacheDirectory: cache,
    });
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const manager = new RuntimeRunManager({
        config,
        sha256,
        store: new InMemoryRuntimeStore(),
        gateway: gateway([[{ type: "text", text: "queued response" }]]),
        workspaceProvider,
        manifestLookup: {
          get({ owner, name, manifestOwner }) {
            return owner === "user-owner" &&
              manifestOwner === "org-owner" &&
              name === "writer"
              ? { owner: manifestOwner, workingDirectory: "reports" }
              : undefined;
          },
        },
      });
      const admission = await manager.admitQueued({
        key: "room:one:agent:writer",
        input: "write a report",
        owner: "user-owner",
        manifestName: "writer",
        manifestOwner: "org-owner",
        mode: "interactive",
        trigger: { source: "room" },
      });
      if (admission.kind !== "started") throw new Error("expected queued run");
      expect((admission.run as RuntimeRunWithManifestOwner).manifestOwner).toBe(
        "org-owner",
      );

      expect(await manager.dispatchQueued(admission.run.id, "user-owner")).toBe(
        true,
      );
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const run = await manager.store.getRun(admission.run.id);
        if (run?.status === "completed") return;
        if (run?.status === "failed")
          throw new Error(run.error ?? "queued run failed");
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      throw new Error("queued run did not finish");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      await rm(cache, { recursive: true, force: true });
    }
  });

  it("cancels a room run that could not enter the room queue", async () => {
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "never dispatched" }]]),
    });
    const admission = await manager.admitQueued({
      key: "room:one:agent:writer",
      input: "reject this queued work",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "room" },
    });
    if (admission.kind !== "started") throw new Error("expected queued run");

    expect(await manager.cancelQueued(admission.run.id, "alice")).toBe(true);
    expect(manager.store.getRun(admission.run.id)?.status).toBe("interrupted");
    expect(await manager.cancelQueued(admission.run.id, "alice")).toBe(false);
  });

  it("logs the run lifecycle without recording the agent response", async () => {
    const debugEntries: string[] = [];
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "complete response" }]]),
      debugLog: (entry) => debugEntries.push(entry),
    });
    const admission = await manager.start({
      key: "debug-output",
      input: "respond",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected start");

    await waitFor(manager, admission.run.id);

    const events = debugEntries.map(
      (entry) => JSON.parse(entry) as Record<string, unknown>,
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "agent_run_started",
          runId: admission.run.id,
        }),
        expect.objectContaining({
          event: "agent_provider_request_completed",
          runId: admission.run.id,
          closeReason: "completed",
        }),
        expect.objectContaining({
          event: "agent_run_summary",
          runId: admission.run.id,
          status: "completed",
          responseChars: 17,
        }),
      ]),
    );
    expect(debugEntries.join("\n")).not.toContain("complete response");
  });

  it("logs a failed tool step even when the agent run completes", async () => {
    const debugEntries: string[] = [];
    const manager = new InMemoryRunManager({
      config,
      registry: new ToolRegistry([
        {
          name: "PreviewChart",
          description: "preview a chart",
          parameters: { type: "object", additionalProperties: false },
          readOnly: true,
          async execute() {
            return {
              success: false,
              output:
                "private query and credentials must stay in the run journal",
              metadata: {},
            };
          },
        },
      ]),
      gateway: gateway([
        [
          {
            type: "tool_call",
            call: { id: "chart-1", name: "PreviewChart", arguments: "{}" },
          },
        ],
        [{ type: "text", text: "I recovered and finished." }],
      ]),
      debugLog: (entry) => debugEntries.push(entry),
    });
    const admission = await manager.start({
      key: "chat:chart-failure",
      input: "preview chart",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected start");

    const run = await waitFor(manager, admission.run.id);
    expect(run.status).toBe("completed");

    const failureEntries = debugEntries
      .map((entry) => JSON.parse(entry) as Record<string, unknown>)
      .filter(
        (entry) =>
          entry.event === "agent_tool_finished" && entry.status === "error",
      );
    expect(failureEntries).toHaveLength(1);
    expect(failureEntries[0]).toMatchObject({
      event: "agent_tool_finished",
      service: "celesnity-agent",
      runId: admission.run.id,
      tool: "PreviewChart",
      status: "error",
    });
    expect(JSON.stringify(failureEntries[0])).not.toContain(
      "private query and credentials",
    );
  });

  it("does not run the base agent when a requested manifest is missing", async () => {
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "base agent must not run" }]]),
      manifestLookup: { get: async () => undefined },
    });
    const admission = await manager.start({
      key: "missing-manifest",
      input: "hello",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "skill-creator",
    });
    if (admission.kind !== "started") throw new Error("expected start");

    const run = await waitFor(manager, admission.run.id);

    expect(run).toMatchObject({
      status: "failed",
      responseText:
        'Agent manifest "skill-creator" was not found for this owner.',
    });
  });

  it("deduplicates webhook deliveries and rejects a busy webhook", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const manager = new InMemoryRunManager({
      config,
      gateway: {
        async *stream(_request, signal) {
          await Promise.race([
            blocked,
            new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), { once: true }),
            ),
          ]);
          if (signal.aborted) return;
          yield { type: "text", text: "done" };
        },
      },
    });
    const first = await manager.start({
      key: "hook",
      input: "run",
      owner: "alice",
      mode: "autonomous",
      trigger: { source: "webhook:github", deliveryId: "d1" },
    });
    expect(first.kind).toBe("started");
    const duplicate = await manager.start({
      key: "other",
      input: "run",
      owner: "alice",
      mode: "autonomous",
      trigger: { source: "webhook:github", deliveryId: "d1" },
    });
    expect(duplicate).toEqual({ kind: "duplicate_delivery" });
    const busy = await manager.start({
      key: "hook",
      input: "again",
      owner: "alice",
      mode: "autonomous",
      trigger: { source: "webhook:github" },
    });
    expect(busy.kind).toBe("rejected");
    release();
    if (first.kind === "started") await waitFor(manager, first.run.id);
  });

  it("pauses an interactive run on AskUser and frees the active slot", async () => {
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([
        [
          {
            type: "tool_call",
            call: {
              id: "ask",
              name: "AskUser",
              arguments: JSON.stringify({
                question: "Choose",
                options: ["A"],
                allow_other: false,
              }),
            },
          },
        ],
      ]),
    });
    const admission = await manager.start({
      key: "chat",
      input: "choose",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected start");
    const run = await waitFor(manager, admission.run.id);
    expect(run.status).toBe("awaiting_input");
    expect(
      manager.getSessionByKey("chat", "alice")?.pendingQuestion?.question,
    ).toBe("Choose");
    expect(manager.store.getLoopSnapshot?.(admission.session.id)).toMatchObject(
      {
        pendingPause: { kind: "question" },
      },
    );
    expect(manager.store.activeRunId(admission.session.id)).toBeUndefined();
  });

  it("restores persisted history when a new manager resumes an AskUser pause", async () => {
    const store = new InMemoryRuntimeStore();
    const first = new InMemoryRunManager({
      config,
      store,
      gateway: gateway([
        [
          {
            type: "tool_call",
            call: {
              id: "ask",
              name: "AskUser",
              arguments:
                '{"question":"Choose","options":["A"],"allow_other":false}',
            },
          },
        ],
      ]),
    });
    const paused = await first.start({
      key: "restart-chat",
      input: "choose a database",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (paused.kind !== "started") throw new Error("expected initial run");
    await waitFor(first, paused.run.id);

    const requests: ChatCompletionRequest[] = [];
    const resumed = new InMemoryRunManager({
      config,
      store,
      gateway: {
        async *stream(request) {
          requests.push(request);
          yield { type: "text", text: "selected" };
        },
      },
    });
    const answer = await resumed.start({
      key: "restart-chat",
      input: "A",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (answer.kind !== "started") throw new Error("expected resumed run");
    await waitFor(resumed, answer.run.id);

    expect(requests[0]?.messages.map((message) => message.content)).toEqual(
      expect.arrayContaining(["choose a database", "A"]),
    );
  });

  it("persists a proposed plan and resumes it through an ordinary user turn", async () => {
    const store = new InMemoryRuntimeStore();
    const requests: ChatCompletionRequest[] = [];
    const manager = new InMemoryRunManager({
      config,
      store,
      gateway: {
        async *stream(request) {
          requests.push(request);
          if (requests.length === 1) {
            yield {
              type: "tool_call",
              call: {
                id: "plan",
                name: "ProposePlan",
                arguments: JSON.stringify({
                  summary: "Update the report",
                  steps: [
                    {
                      tool_name: "Write",
                      arguments: { file_path: "report.md" },
                      rationale: "Create the report.",
                    },
                  ],
                }),
              },
            };
            return;
          }
          yield { type: "text", text: "Plan confirmed and completed." };
        },
      },
    });
    const paused = await manager.start({
      key: "plan-chat",
      input: "prepare a report",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (paused.kind !== "started") throw new Error("expected initial run");
    expect((await waitFor(manager, paused.run.id)).status).toBe(
      "awaiting_plan_confirmation",
    );
    expect(manager.getSessionByKey("plan-chat", "alice")).toMatchObject({
      pendingPlan: { summary: "Update the report" },
    });

    const resumed = await manager.start({
      key: "plan-chat",
      input: "User confirmed this plan.",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (resumed.kind !== "started") throw new Error("expected resumed run");
    expect((await waitFor(manager, resumed.run.id)).status).toBe("completed");
    expect(
      manager.getSessionByKey("plan-chat", "alice")?.pendingPlan,
    ).toBeUndefined();
    expect(requests[1]?.messages.map((message) => message.content)).toEqual(
      expect.arrayContaining(["User confirmed this plan."]),
    );
  });

  it("persists a client request and injects its matching result on resume", async () => {
    const requests: ChatCompletionRequest[] = [];
    const manager = new InMemoryRunManager({
      config,
      clientTools: [
        {
          name: "RenderPreview",
          description: "Render markdown in the client.",
          parameters: { type: "object" },
        },
      ],
      gateway: {
        async *stream(request) {
          requests.push(request);
          if (requests.length === 1) {
            yield {
              type: "tool_call",
              call: {
                id: "preview",
                name: "RenderPreview",
                arguments: '{"markdown":"# Draft"}',
              },
            };
            return;
          }
          yield { type: "text", text: "Preview received." };
        },
      },
    });
    const paused = await manager.start({
      key: "client-chat",
      input: "preview this",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (paused.kind !== "started") throw new Error("expected initial run");
    expect((await waitFor(manager, paused.run.id)).status).toBe(
      "awaiting_client_tool",
    );

    const resumed = await manager.start({
      key: "client-chat",
      input: "client completed preview",
      clientToolResult: {
        id: "preview",
        content: "<rendered />",
        isError: false,
      },
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (resumed.kind !== "started") throw new Error("expected resumed run");
    expect((await waitFor(manager, resumed.run.id)).status).toBe("completed");
    expect(
      requests[1]?.messages.filter(
        (message) =>
          message.role === "tool" && message.tool_call_id === "preview",
      ),
    ).toContainEqual(expect.objectContaining({ content: "<rendered />" }));
  });

  it("supplies the confined autonomous registry to a background run", async () => {
    const defaultRegistries = createRuntimeToolRegistries();
    const requests: ChatCompletionRequest[] = [];
    const scripts: readonly (readonly ModelStreamEvent[])[] = [
      [
        {
          type: "tool_call",
          call: {
            id: "read",
            name: "Read",
            arguments: '{"file_path":"package.json"}',
          },
        },
      ],
      [{ type: "text", text: "completed" }],
    ];
    let index = 0;
    const manager = new InMemoryRunManager({
      config,
      defaultToolRegistries: defaultRegistries,
      gateway: {
        async *stream(request) {
          requests.push(request);
          yield* scripts[index++] ?? [];
        },
      },
    });

    const admission = await manager.start({
      key: "hook:tools",
      input: "inspect",
      owner: "alice",
      mode: "autonomous",
      trigger: { source: "webhook" },
    });
    if (admission.kind !== "started") throw new Error("expected start");
    await waitFor(manager, admission.run.id);

    expect(requests[0]?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "Read" }),
        }),
      ]),
    );
    expect(requests[0]?.tools).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "AskUser" }),
        }),
      ]),
    );
    expect(
      manager
        .replay(admission.run.id, 0, 512)
        .map((event) => event.payload.type),
    ).toEqual(["tool_started", "tool_finished", "tool_result", "text", "done"]);

    const interactive = await manager.start({
      key: "chat:tools",
      input: "inspect",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (interactive.kind !== "started") throw new Error("expected start");
    await waitFor(manager, interactive.run.id);

    expect(requests[2]?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "Read" }),
        }),
        expect.objectContaining({
          function: expect.objectContaining({ name: "AskUser" }),
        }),
      ]),
    );
  });
});

describe("principal-scope run isolation", () => {
  const scopeKey = (organizationId: string): string =>
    principalScopeKey(
      createPrincipalScope({
        identityTenantId: "tenant-a",
        organizationId,
        identityId: "alice",
      }),
    );

  it("cannot read or replay a run from another organization for the same identity", async () => {
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "hi" }]]),
    });
    const ownerA = scopeKey("org-a");
    const ownerB = scopeKey("org-b");

    const admission = await manager.start({
      key: "same",
      input: "hello",
      owner: ownerA,
      mode: "interactive",
      trigger: { source: "chat" },
    });
    expect(admission.kind).toBe("started");
    const runId = admission.kind === "started" ? admission.run.id : "";
    await waitFor(manager, runId);

    // Same identity, different organization, is a foreign principal scope.
    expect(manager.getAuthorizedRun(runId, ownerB)).toBeUndefined();
    expect(manager.getAuthorizedRun(runId, ownerA)?.id).toBe(runId);

    // A foreign scope observes no session under the shared key either.
    expect(manager.getSessionByKey("same", ownerB)).toBeUndefined();
    expect(manager.getSessionByKey("same", ownerA)?.key).toBe("same");
  });

  it("keeps different identities in the same organization isolated", async () => {
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "hi" }]]),
    });
    const alice = principalScopeKey(
      createPrincipalScope({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
        identityId: "alice",
      }),
    );
    const bob = principalScopeKey(
      createPrincipalScope({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
        identityId: "bob",
      }),
    );
    const admission = await manager.start({
      key: "shared",
      input: "hello",
      owner: alice,
      mode: "interactive",
      trigger: { source: "chat" },
    });
    const runId = admission.kind === "started" ? admission.run.id : "";
    await waitFor(manager, runId);
    expect(manager.getAuthorizedRun(runId, bob)).toBeUndefined();
  });

  it("snapshots the owner manifest at admission and hides a foreign manifest", async () => {
    let manifest = {
      owner: "alice",
      governance: {
        actionApprovals: { "report.publish": true },
        autonomy: "safe" as const,
        sandbox: { enabled: false, allowedCommands: [], writablePaths: [] },
        sensitiveFiles: "deny" as const,
        budget: {
          maxInputTokens: 128000,
          maxOutputTokens: 16384,
          maxToolCalls: 3,
          maxCostUsd: null,
        },
      },
    };
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "first" }]]),
      manifestLookup: {
        get({ owner, name }) {
          return owner === "alice" && name === "writer" ? manifest : undefined;
        },
      },
    });

    const admitted = await manager.start({
      key: "governed",
      input: "write report",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "writer",
    });
    if (admitted.kind !== "started") throw new Error("expected admission");
    const originalRevision = admitted.run.governance?.policyRevision;
    expect(admitted.run.governance?.policy?.budget.maxToolCalls).toBe(3);

    manifest = {
      ...manifest,
      governance: {
        ...manifest.governance,
        budget: { ...manifest.governance.budget, maxToolCalls: 9 },
      },
    };
    expect(admitted.run.governance?.policy?.budget.maxToolCalls).toBe(3);
    expect(admitted.run.governance?.policyRevision).toBe(originalRevision);

    const foreign = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "second" }]]),
      manifestLookup: {
        get() {
          return { ...manifest, owner: "bob" };
        },
      },
    });
    const foreignAdmission = await foreign.start({
      key: "foreign",
      input: "write report",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "writer",
    });
    if (foreignAdmission.kind !== "started")
      throw new Error("expected admission");
    expect(foreignAdmission.run.governance?.policy?.budget.maxToolCalls).toBe(
      50,
    );
    expect(foreignAdmission.run.governance?.policy?.actionApprovals).toEqual(
      {},
    );
  });

  it("uses manifestOwner for lookup while keeping resourceOwner on the run", async () => {
    let lookedUpOwner = "";
    let lookedUpManifestOwner = "";
    const manager = new InMemoryRunManager({
      config,
      gateway: gateway([[{ type: "text", text: "finished" }]]),
      manifestLookup: {
        get({ owner, manifestOwner, name }) {
          lookedUpOwner = `${owner}:${name}`;
          lookedUpManifestOwner = manifestOwner ?? "";
          return undefined;
        },
      },
    });

    const admission = await manager.start({
      key: "organization-manifest",
      input: "run shared agent",
      owner: "resource-owner-alice",
      manifestOwner: "organization-scope",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "writer",
    });

    expect(lookedUpOwner).toBe("resource-owner-alice:writer");
    expect(lookedUpManifestOwner).toBe("organization-scope");
    expect(admission.kind).toBe("started");
    if (admission.kind === "started")
      expect(admission.session.owner).toBe("resource-owner-alice");
  });

  it("rejects manifest execution without an organization owner in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const manager = new InMemoryRunManager({
        config,
        gateway: gateway([[{ type: "text", text: "must not run" }]]),
        manifestLookup: { get: async () => undefined },
      });
      await expect(
        manager.start({
          key: "missing-manifest-owner",
          input: "run shared agent",
          owner: "resource-owner-alice",
          mode: "interactive",
          trigger: { source: "chat" },
          manifestName: "writer",
        }),
      ).rejects.toThrow("manifest owner is required");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("records an immutable, owner-scoped admission snapshot for the runtime manager", async () => {
    let manifest = {
      owner: "alice",
      governance: {
        autonomy: "safe" as const,
        sandbox: {
          enabled: true,
          allowedCommands: ["git"],
          writablePaths: ["reports"],
        },
        budget: { maxToolCalls: 3 },
      },
    };
    const store = new InMemoryRuntimeStore();
    const manager = new RuntimeRunManager({
      config,
      sha256,
      store,
      gateway: gateway([[{ type: "text", text: "complete" }]]),
      now: () => "2026-09-16T00:00:00.000Z",
      manifestLookup: {
        get({ owner, name }) {
          return owner === "alice" && name === "writer" ? manifest : undefined;
        },
      },
    });

    const admission = await manager.start({
      key: "runtime-governed",
      input: "write report",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "writer",
    });
    if (admission.kind !== "started") throw new Error("expected admission");

    manifest = {
      ...manifest,
      governance: {
        ...manifest.governance,
        budget: { maxToolCalls: 9 },
      },
    };
    const evidence = store.getGovernanceAdmission(admission.run.id, "alice");

    expect(evidence).toEqual({
      owner: "alice",
      runId: admission.run.id,
      policyRevision: admission.run.governance?.policyRevision,
      policy: {
        actionApprovals: {},
        autoApprovals: ["*"],
        autonomy: "safe",
        sandbox: {
          enabled: true,
          allowedCommandCount: 1,
          writablePathCount: 1,
        },
        sensitiveFiles: "deny",
        budget: {
          maxInputTokens: 128000,
          maxOutputTokens: 16384,
          maxToolCalls: 3,
          maxCostUsd: null,
        },
      },
      admittedAt: "2026-09-16T00:00:00.000Z",
    });
    expect(admission.run.governance?.policy?.budget.maxToolCalls).toBe(3);
    expect(
      store.getGovernanceAdmission(admission.run.id, "bob"),
    ).toBeUndefined();
  });
});

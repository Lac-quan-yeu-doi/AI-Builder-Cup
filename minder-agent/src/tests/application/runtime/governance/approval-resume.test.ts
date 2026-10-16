import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { ToolRegistry, type MinderTool } from "@infrastructure/tools/core";
import type { ApprovalStore, GovernanceManifest } from "@application/runtime";
import { describe, expect, it } from "vitest";
import {
  createApprovalService,
  createMemoryApprovalStore,
  InMemoryRunManager,
  InMemoryRuntimeStore,
} from "@application/runtime";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "test",
  model: "test",
};

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

function writeCall(content = "secret report"): ModelStreamEvent {
  return {
    type: "tool_call",
    call: {
      id: "write-1",
      name: "Write",
      arguments: JSON.stringify({ file_path: "report.md", content }),
    },
  };
}

function writeTool(
  execute: () => Promise<{ success: boolean; output: string }>,
): MinderTool {
  return {
    name: "Write",
    description: "Write a report.",
    parameters: { type: "object" },
    category: "write",
    readOnly: false,
    async execute() {
      const result = await execute();
      return { ...result, metadata: {} };
    },
  };
}

async function waitForStatus(
  manager: InMemoryRunManager,
  runId: string,
  status: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = manager.store.getRun(runId);
    if (run?.status === status) return run;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${runId} did not reach ${status}`);
}

function setup(
  options: {
    readonly store?: InMemoryRuntimeStore;
    readonly now?: () => string;
    readonly approvalStore?: ApprovalStore;
    readonly execute?: () => Promise<{ success: boolean; output: string }>;
    readonly scripts?: readonly (readonly ModelStreamEvent[])[];
    readonly manifestLookup?: {
      get(input: {
        readonly owner: string;
        readonly name: string;
      }):
        | GovernanceManifest
        | undefined
        | Promise<GovernanceManifest | undefined>;
    };
  } = {},
) {
  const approvalStore = options.approvalStore ?? createMemoryApprovalStore();
  const approvals = createApprovalService({
    store: approvalStore,
    ids: () => "approval-1",
    now: options.now ?? (() => "2026-09-15T00:00:00.000Z"),
  });
  let executions = 0;
  const manager = new InMemoryRunManager({
    sha256,
    config,
    runtimeGovernanceDefaults: { autoApprovals: [] },
    ...(options.store === undefined ? {} : { store: options.store }),
    approvalService: approvals,
    approvalRedactor: () => "report.md",
    ...(options.manifestLookup === undefined
      ? {}
      : { manifestLookup: options.manifestLookup }),
    ...(options.now === undefined ? {} : { now: options.now }),
    registry: new ToolRegistry([
      writeTool(async () => {
        executions += 1;
        return options.execute?.() ?? { success: true, output: "written" };
      }),
    ]),
    gateway: gateway(
      options.scripts ?? [[writeCall()], [{ type: "text", text: "complete" }]],
    ),
  });
  return { approvalStore, approvals, manager, executions: () => executions };
}

async function startPaused(manager: InMemoryRunManager, manifestName?: string) {
  const admission = await manager.start({
    key: "chat:approval",
    owner: "alice",
    mode: "interactive",
    input: "write report",
    trigger: { source: "chat" },
    ...(manifestName === undefined ? {} : { manifestName }),
  });
  if (admission.kind !== "started") throw new Error("expected initial run");
  await waitForStatus(manager, admission.run.id, "awaiting_approval");
  return admission;
}

describe("approval resume", () => {
  it("executes one verified approved call in a successor run", async () => {
    const { approvals, manager, executions } = setup();
    const initial = await startPaused(manager);

    expect(manager.getSessionByKey("chat:approval", "alice")).toMatchObject({
      pendingApproval: { approvalId: "approval-1", toolCallId: "write-1" },
    });
    await approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "approved",
    });
    await expect(
      manager.resumeApproval({
        owner: "alice",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toMatchObject({ kind: "started" });

    expect(executions()).toBe(1);
    expect(
      JSON.stringify(manager.getSessionByKey("chat:approval", "alice")),
    ).not.toContain("secret report");
  });

  it("does not execute when a foreign owner resumes", async () => {
    const { manager, executions } = setup();
    const initial = await startPaused(manager);

    await expect(
      manager.resumeApproval({
        owner: "bob",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toMatchObject({ kind: "not_found" });
    expect(executions()).toBe(0);
  });

  it("records a denied call without executing it", async () => {
    const { approvals, manager, executions } = setup();
    const initial = await startPaused(manager);
    await approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "denied",
    });

    await expect(
      manager.resumeApproval({
        owner: "alice",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toMatchObject({ kind: "resolved", status: "denied" });
    expect(executions()).toBe(0);
    expect(
      manager.getSessionByKey("chat:approval", "alice")?.pendingApproval,
    ).toBeUndefined();
  });

  it("expires a pending approval without executing it", async () => {
    let now = "2026-09-15T00:00:00.000Z";
    const { manager, executions } = setup({ now: () => now });
    const initial = await startPaused(manager);
    now = "2026-09-15T00:06:00.000Z";

    await expect(
      manager.resumeApproval({
        owner: "alice",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toMatchObject({ kind: "resolved", status: "expired" });
    expect(executions()).toBe(0);
  });

  it("does not execute twice when the approval is resumed twice", async () => {
    const { approvals, manager, executions } = setup();
    const initial = await startPaused(manager);
    await approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "approved",
    });
    await manager.resumeApproval({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
    });

    await expect(
      manager.resumeApproval({
        owner: "alice",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toMatchObject({ kind: "not_found" });
    expect(executions()).toBe(1);
  });

  it("fails closed when the durable call arguments no longer match", async () => {
    const { approvals, manager, executions } = setup();
    const initial = await startPaused(manager);
    const session = manager.getSessionByKey("chat:approval", "alice")!;
    const snapshot = manager.store.getLoopSnapshot(session.id) as {
      messages: Array<{
        role: string;
        toolCalls?: Array<{ id: string; arguments: Record<string, string> }>;
      }>;
    };
    snapshot.messages.find(
      (message) => message.role === "assistant",
    )!.toolCalls![0]!.arguments.content = "tampered";
    manager.store.saveLoopSnapshot(session.id, snapshot);
    await approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "approved",
    });

    await expect(
      manager.resumeApproval({
        owner: "alice",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toMatchObject({ kind: "resolved", status: "hash_mismatch" });
    expect(executions()).toBe(0);
  });

  it("recovers a paused approval in a new manager instance", async () => {
    const store = new InMemoryRuntimeStore();
    const first = setup({ store });
    const initial = await startPaused(first.manager);
    const second = setup({ store, approvalStore: first.approvalStore });
    await second.approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "approved",
    });

    await expect(
      second.manager.resumeApproval({
        owner: "alice",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toMatchObject({ kind: "started" });
    expect(second.executions()).toBe(1);
  });

  it("propagates the admitted policy to an approval successor without re-resolving", async () => {
    let manifest: GovernanceManifest = {
      owner: "alice",
      governance: { autonomy: "safe", budget: { maxToolCalls: 3 } },
    };
    let lookups = 0;
    const store = new InMemoryRuntimeStore();
    const manifestLookup = {
      get() {
        lookups += 1;
        return manifest;
      },
    };
    const first = setup({ store, manifestLookup });
    const initial = await startPaused(first.manager, "writer");
    expect(initial.run.governance?.policy?.budget.maxToolCalls).toBe(3);

    manifest = {
      ...manifest,
      governance: { autonomy: "safe", budget: { maxToolCalls: 9 } },
    };
    await first.approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "approved",
    });
    const second = setup({
      store,
      approvalStore: first.approvalStore,
      manifestLookup,
    });

    const resumed = await second.manager.resumeApproval({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
    });
    if (resumed.kind !== "started") throw new Error("expected successor run");
    expect(resumed.run.governance?.policy?.budget.maxToolCalls).toBe(3);
    expect(lookups).toBe(1);
  });

  it("continues after a failed approved tool execution", async () => {
    const { approvals, manager, executions } = setup({
      execute: async () => ({ success: false, output: "write failed" }),
    });
    const initial = await startPaused(manager);
    await approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "approved",
    });

    const resumed = await manager.resumeApproval({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
    });
    if (resumed.kind !== "started") throw new Error("expected resumed run");
    await waitForStatus(manager, resumed.run.id, "completed");
    expect(executions()).toBe(1);
  });
});

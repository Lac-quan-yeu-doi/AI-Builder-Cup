import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { ToolRegistry, type MinderTool } from "@infrastructure/tools/core";
import { describe, expect, it } from "vitest";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import {
  createApprovalService,
  createMemoryApprovalStore,
  InMemoryRuntimeStore,
  RuntimeRunManager,
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

async function waitFor(
  store: InMemoryRuntimeStore,
  runId: string,
  status: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (store.getRun(runId)?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${runId} did not reach ${status}`);
}

describe("RuntimeRunManager approval execution claim", () => {
  it("allows only one manager to execute an approved call", async () => {
    const store = new InMemoryRuntimeStore();
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
      ids: () => "approval-1",
      now: () => "2026-09-15T00:00:00.000Z",
    });
    let executions = 0;
    let release!: () => void;
    const running = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tool: MinderTool = {
      name: "Write",
      description: "Write a report.",
      parameters: { type: "object" },
      category: "write",
      readOnly: false,
      async execute() {
        executions += 1;
        await running;
        return { success: true, output: "written", metadata: {} };
      },
    };
    const first = new RuntimeRunManager({
      config,
      sha256,
      store,
      runtimeGovernanceDefaults: { autoApprovals: [] },
      approvalService: approvals,
      approvalRedactor: () => "report.md",
      registry: new ToolRegistry([tool]),
      gateway: gateway([
        [
          {
            type: "tool_call",
            call: {
              id: "write-1",
              name: "Write",
              arguments: '{"file_path":"report.md","content":"secret"}',
            },
          },
        ],
        [{ type: "text", text: "complete" }],
      ]),
    });
    const second = new RuntimeRunManager({
      config,
      sha256,
      store,
      runtimeGovernanceDefaults: { autoApprovals: [] },
      approvalService: approvals,
      approvalRedactor: () => "report.md",
      registry: new ToolRegistry([tool]),
      gateway: gateway([[{ type: "text", text: "complete" }]]),
    });
    const initial = await first.start({
      key: "chat:approval",
      owner: "alice",
      mode: "interactive",
      input: "write report",
      trigger: { source: "chat" },
    });
    if (initial.kind !== "started") throw new Error("expected initial run");
    await waitFor(store, initial.run.id, "awaiting_approval");
    await approvals.decide({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
      decision: "approved",
    });

    const resuming = first.resumeApproval({
      owner: "alice",
      runId: initial.run.id,
      approvalId: "approval-1",
    });
    for (let attempt = 0; attempt < 100 && executions === 0; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 1));
    await expect(
      second.resumeApproval({
        owner: "alice",
        runId: initial.run.id,
        approvalId: "approval-1",
      }),
    ).resolves.toEqual({ kind: "resolved", status: "execution_ambiguous" });
    expect(executions).toBe(1);
    release();
    await resuming;
  });

  it("fails closed after restart recovery finds an uncompleted claim", async () => {
    const store = new InMemoryRuntimeStore();
    const claimed = store.claimApprovalExecution({
      owner: "alice",
      runId: "run-1",
      approvalId: "approval-1",
    });
    expect(claimed).toBe("claimed");

    store.recoverInterrupted();

    expect(
      store.claimApprovalExecution({
        owner: "alice",
        runId: "run-1",
        approvalId: "approval-1",
      }),
    ).toBe("ambiguous");
  });
});

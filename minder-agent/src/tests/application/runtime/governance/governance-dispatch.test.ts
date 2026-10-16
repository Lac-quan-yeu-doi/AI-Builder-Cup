import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import { ToolRegistry, type MinderTool } from "@infrastructure/tools/core";
import { describe, expect, it } from "vitest";
import {
  createApprovalService,
  createMemoryApprovalStore,
  InMemoryRunManager,
} from "@application/runtime";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

function scripted(events: readonly ModelStreamEvent[]): ChatCompletionGateway {
  return {
    async *stream() {
      yield* events;
    },
  };
}

async function waitForTerminal(
  manager: InMemoryRunManager,
  runId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = manager.store.getRun(runId)?.status;
    if (status === "completed" || status === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${runId} did not finish`);
}

describe("governed runtime dispatch", () => {
  it("executes an explicitly auto-approved mutable action without creating an approval", async () => {
    let executions = 0;
    const write: MinderTool = {
      name: "Write",
      description: "Writes a file.",
      parameters: { type: "object" },
      readOnly: false,
      async execute() {
        executions += 1;
        return { success: true, output: "written", metadata: {} };
      },
    };
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
    });
    let turns = 0;
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      registry: new ToolRegistry([write]),
      approvalService: approvals,
      runtimeGovernanceDefaults: { autoApprovals: ["Write"] },
      gateway: {
        async *stream() {
          if (turns++ === 0)
            yield {
              type: "tool_call" as const,
              call: { id: "write-auto-1", name: "Write", arguments: "{}" },
            };
          else yield { type: "text" as const, text: "finished" };
        },
      },
    });

    const admission = await runtime.start({
      key: "governance-auto-approval",
      input: "write a report",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "test" },
    });
    if (admission.kind !== "started") throw new Error("expected run");
    await waitForTerminal(runtime, admission.run.id);

    expect(executions).toBe(1);
    await expect(
      approvals.list({ owner: "alice", runId: admission.run.id }),
    ).resolves.toEqual([]);
  });

  it("blocks autonomous tool execution at the immutable run budget and records the decision", async () => {
    let executions = 0;
    const write: MinderTool = {
      name: "Write",
      description: "Writes a file.",
      parameters: { type: "object" },
      readOnly: false,
      async execute() {
        executions += 1;
        return { success: true, output: "written", metadata: {} };
      },
    };
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      registry: new ToolRegistry([write]),
      autonomousRegistry: new ToolRegistry([write]),
      runtimeGovernanceDefaults: { budget: { maxToolCalls: 0 } },
      gateway: scripted([
        {
          type: "tool_call",
          call: { id: "write-1", name: "Write", arguments: "{}" },
        },
        { type: "text", text: "finished" },
      ]),
    });

    const admission = await runtime.start({
      key: "governance-dispatch",
      input: "write a report",
      owner: "alice",
      mode: "autonomous",
      trigger: { source: "test" },
    });
    if (admission.kind !== "started") throw new Error("expected run");
    await waitForTerminal(runtime, admission.run.id);

    expect(executions).toBe(0);
    expect(
      runtime.store.listGovernanceEvidence(
        "alice",
        admission.run.id,
        undefined,
        20,
      ).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool_decision",
          detail: expect.objectContaining({
            decision: "deny",
            action: "Write",
          }),
        }),
      ]),
    );
  });

  it("tracks usage cost and records a durable budget exhaustion event", async () => {
    let executions = 0;
    const write: MinderTool = {
      name: "Write",
      description: "Writes a file.",
      parameters: { type: "object" },
      readOnly: false,
      async execute() {
        executions += 1;
        return { success: true, output: "written", metadata: {} };
      },
    };
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      registry: new ToolRegistry([write]),
      autonomousRegistry: new ToolRegistry([write]),
      runtimeGovernanceDefaults: {
        autonomy: "supervised",
        budget: { maxCostUsd: 0.001 },
      },
      runtimeGovernancePricing: { inputCostPer1kUsd: 1, outputCostPer1kUsd: 0 },
      gateway: scripted([
        { type: "usage", input: 2, output: 0 },
        {
          type: "tool_call",
          call: { id: "write-cost-1", name: "Write", arguments: "{}" },
        },
        { type: "text", text: "finished" },
      ]),
    });

    const admission = await runtime.start({
      key: "governance-cost",
      input: "write a report",
      owner: "alice",
      mode: "autonomous",
      trigger: { source: "test" },
    });
    if (admission.kind !== "started") throw new Error("expected run");
    await waitForTerminal(runtime, admission.run.id);

    expect(executions).toBe(0);
    expect(
      runtime.store.listGovernanceEvidence(
        "alice",
        admission.run.id,
        undefined,
        20,
      ).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "budget_exhausted",
          detail: expect.objectContaining({
            reason: "governance budget exhausted",
            usage: expect.objectContaining({ costUsd: 0.002 }),
          }),
        }),
      ]),
    );
  });
});

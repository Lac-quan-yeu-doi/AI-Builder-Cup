import { sha256 } from "@infrastructure/crypto/sha256.js";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import {
  createApprovalService,
  createMemoryApprovalStore,
  InMemoryRunManager,
} from "@application/runtime";
import { ToolRegistry, type MinderTool } from "@infrastructure/tools/core";
import { describe, expect, it } from "vitest";
import { request, startTestServer } from "./harness.js";

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

function scriptedTurns(
  turns: readonly (readonly ModelStreamEvent[])[],
): ChatCompletionGateway {
  let index = 0;
  return {
    async *stream() {
      yield* turns[index++] ?? [];
    },
  };
}

async function waitForStatus(
  manager: InMemoryRunManager,
  runId: string,
  status: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (manager.store.getRun(runId)?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${runId} did not reach ${status}`);
}

describe("run approval HTTP routes", () => {
  it("continues a live approval-gated run only after the owner approves it", async () => {
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
      ids: () => "approval-1",
      now: () => "2026-09-15T00:00:00.000Z",
    });
    let writes = 0;
    const write: MinderTool = {
      name: "Write",
      description: "Write a report.",
      parameters: { type: "object" },
      category: "write",
      readOnly: false,
      async execute() {
        writes += 1;
        return { success: true, output: "written", metadata: {} };
      },
    };
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      runtimeGovernanceDefaults: {
        autonomy: "manual",
        autoApprovals: [],
      },
      approvalService: approvals,
      approvalRedactor: () => "report.md",
      registry: new ToolRegistry([write]),
      gateway: scriptedTurns([
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
    const server = await startTestServer({
      runtime,
      approvalService: approvals,
    });
    try {
      const started = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: "chat:approval", input: "write report" },
      });
      const runId = (JSON.parse(started.body) as { run_id: string }).run_id;
      await waitForStatus(runtime, runId, "awaiting_approval");
      expect(writes).toBe(0);

      const pending = await request(server, `/api/v1/runs/${runId}/approvals`, {
        headers: { "x-caller-id": "alice" },
      });
      expect(JSON.stringify(JSON.parse(pending.body))).not.toContain("secret");

      const decision = await request(
        server,
        `/api/v1/runs/${runId}/approvals/approval-1/decision`,
        {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: { decision: "approved" },
        },
      );
      expect(decision.status).toBe(200);
      for (let attempt = 0; attempt < 100 && writes === 0; attempt += 1)
        await new Promise((resolve) => setTimeout(resolve, 1));
      expect(writes).toBe(1);
      expect(
        runtime.getSessionByKey("chat:approval", "alice")?.pendingApproval,
      ).toBeUndefined();
      expect(
        runtime.store.listGovernanceEvidence("alice", runId, undefined, 20)
          .items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "approval_requested" }),
          expect.objectContaining({
            kind: "redaction",
            detail: expect.objectContaining({
              fields: ["arguments", "preview"],
            }),
          }),
          expect.objectContaining({
            kind: "approval_decided",
            detail: { approvalId: "approval-1", status: "approved" },
          }),
        ]),
      );
    } finally {
      await server.close();
    }
  });

  it("settles a denied live approval without executing the tool", async () => {
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
      ids: () => "approval-1",
      now: () => "2026-09-15T00:00:00.000Z",
    });
    let writes = 0;
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      runtimeGovernanceDefaults: {
        autonomy: "manual",
        autoApprovals: [],
      },
      approvalService: approvals,
      approvalRedactor: () => "report.md",
      registry: new ToolRegistry([
        {
          name: "Write",
          description: "Write a report.",
          parameters: { type: "object" },
          category: "write",
          readOnly: false,
          async execute() {
            writes += 1;
            return { success: true, output: "written", metadata: {} };
          },
        },
      ]),
      gateway: scriptedTurns([
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
      ]),
    });
    const server = await startTestServer({
      runtime,
      approvalService: approvals,
    });
    try {
      const started = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: "chat:denied", input: "write report" },
      });
      const runId = (JSON.parse(started.body) as { run_id: string }).run_id;
      await waitForStatus(runtime, runId, "awaiting_approval");

      await request(
        server,
        `/api/v1/runs/${runId}/approvals/approval-1/decision`,
        {
          method: "POST",
          headers: { "x-caller-id": "alice" },
          body: { decision: "denied" },
        },
      );

      expect(writes).toBe(0);
      expect(
        runtime.getSessionByKey("chat:denied", "alice")?.pendingApproval,
      ).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it("lists and decides an approval only for the run owner", async () => {
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      gateway: scripted([{ type: "text", text: "done" }]),
    });
    const admission = await runtime.start({
      key: "chat:approval",
      input: "hello",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
    });
    if (admission.kind !== "started") throw new Error("expected run admission");
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
      ids: () => "approval-1",
      now: () => "2026-09-15T00:00:00.000Z",
    });
    await approvals.request({
      owner: "alice",
      runId: admission.run.id,
      toolCallId: "call-1",
      action: "Write",
      argumentsHash: "sha256:abc",
      preview: "report.md",
      expiresAt: "2026-09-15T00:05:00.000Z",
    });
    const server = await startTestServer({
      runtime,
      approvalService: approvals,
    });
    try {
      const path = `/api/v1/runs/${admission.run.id}/approvals`;
      const listed = await request(server, path, {
        headers: { "x-caller-id": "alice" },
      });
      expect(listed).toMatchObject({ status: 200 });
      expect(JSON.parse(listed.body)).toEqual([
        expect.objectContaining({
          id: "approval-1",
          tool_call_id: "call-1",
          status: "pending",
        }),
      ]);

      expect(
        (
          await request(server, path, {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);

      const decided = await request(server, `${path}/approval-1/decision`, {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { decision: "approved" },
      });
      expect(decided).toMatchObject({ status: 200 });
      expect(JSON.parse(decided.body)).toMatchObject({ status: "approved" });

      expect(
        (
          await request(server, `${path}/approval-1/decision`, {
            method: "POST",
            headers: { "x-caller-id": "bob" },
            body: { decision: "denied" },
          })
        ).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });
});

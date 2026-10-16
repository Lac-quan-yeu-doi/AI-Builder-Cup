import { describe, expect, it } from "vitest";
import { InMemoryRuntimeStore } from "@application/runtime/execution/memory-store.js";
import {
  DEFAULT_RUNTIME_GOVERNANCE_POLICY,
  admitGovernancePolicy,
  resolveGovernancePolicy,
} from "@application/runtime";
import { sha256 } from "@infrastructure/crypto/sha256.js";

function governance() {
  return admitGovernancePolicy(
    resolveGovernancePolicy({
      owner: "alice",
      sha256,
      runtimeDefaults: DEFAULT_RUNTIME_GOVERNANCE_POLICY,
    }),
    "2026-09-16T00:00:00.000Z",
  );
}

describe("runtime governance evidence", () => {
  it("stores redacted evidence and returns an owner-scoped cursor page", () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession(
      "alice",
      "chat:evidence",
      "interactive",
    );
    const run = store.createRun(
      session.id,
      "inspect",
      "interactive",
      { source: "chat" },
      governance(),
    );

    store.appendGovernanceEvidence("alice", {
      runId: run.id,
      at: "2026-09-16T00:00:01.000Z",
      kind: "tool_decision",
      detail: {
        action: "Write",
        decision: "approval_required",
        reason: "manual autonomy requires approval",
        readOnly: false,
        usage: { toolCalls: 1, inputTokens: 2, outputTokens: 3, costUsd: 0.01 },
      },
    });
    store.appendGovernanceEvidence("alice", {
      runId: run.id,
      at: "2026-09-16T00:00:02.000Z",
      kind: "approval_requested",
      detail: {
        approvalId: "approval-1",
        toolCallId: "call-1",
        action: "Write",
        expiresAt: "2026-09-16T00:05:00.000Z",
      },
    });

    const first = store.listGovernanceEvidence("alice", run.id, undefined, 1);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      seq: 1,
      kind: "admission",
    });
    expect(first.nextCursor).toBe("1");
    expect(
      store.listGovernanceEvidence("bob", run.id, undefined, 10).items,
    ).toEqual([]);
    const second = store.listGovernanceEvidence(
      "alice",
      run.id,
      first.nextCursor,
      1,
    );
    expect(second.items).toMatchObject([
      {
        seq: 2,
        kind: "tool_decision",
        detail: { action: "Write", decision: "approval_required" },
      },
    ]);
    expect(
      store.listGovernanceEvidence("alice", run.id, second.nextCursor, 10)
        .items,
    ).toMatchObject([{ seq: 3, kind: "approval_requested" }]);
  });
});

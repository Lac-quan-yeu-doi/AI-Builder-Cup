import type { AgentEvent } from "@domain/shared";
import { describe, expect, it } from "vitest";
import { InMemoryRuntimeStore, RuntimeStoreError } from "@application/runtime";

const trigger = { source: "chat" };

describe("InMemoryRuntimeStore", () => {
  it("scopes sessions by owner and key and preserves mode", () => {
    const store = new InMemoryRuntimeStore();
    const first = store.getOrCreateSession("alice", "chat:one", "interactive");
    const same = store.getOrCreateSession("alice", "chat:one", "interactive");
    const other = store.getOrCreateSession("bob", "chat:one", "autonomous");

    expect(same.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(() =>
      store.getOrCreateSession("alice", "chat:one", "autonomous"),
    ).toThrow(RuntimeStoreError);
    expect(store.getSessionByKey("alice", "chat:one")?.mode).toBe(
      "interactive",
    );
  });

  it("tracks active slots and terminal timestamps", () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession(
      "alice",
      "chat:one",
      "interactive",
    );
    const run = store.createRun(session.id, "hello", "interactive", trigger);
    expect(store.markRunning(run.id)).toBe(true);
    expect(store.activeRunId(session.id)).toBe(run.id);
    expect(
      store.markRunning(
        store.createRun(session.id, "again", "interactive", trigger).id,
      ),
    ).toBe(false);
    const finished = store.finishRun(run.id, "completed");
    expect(finished.status).toBe("completed");
    expect(finished.finishedAt).toEqual(expect.any(String));
    expect(store.activeRunId(session.id)).toBeUndefined();
  });

  it("deduplicates delivery claims without creating state", () => {
    const store = new InMemoryRuntimeStore();
    expect(store.claimDelivery("github", "delivery-1")).toBe(true);
    expect(store.claimDelivery("github", "delivery-1")).toBe(false);
    expect(store.getSessionByKey("alice", "unused")).toBeUndefined();
  });

  it("journals dense immutable event envelopes", () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession(
      "alice",
      "chat:one",
      "interactive",
    );
    const run = store.createRun(session.id, "hello", "interactive", trigger);
    const first: AgentEvent = { type: "text", data: "hi" };
    const second: AgentEvent = { type: "done", data: null };
    const one = store.appendEvent(run.id, first);
    const two = store.appendEvent(run.id, second);
    expect([one.seq, two.seq]).toEqual([1, 2]);
    const replay = store.replay(run.id, 0, 512);
    expect(replay.map((event) => event.seq)).toEqual([1, 2]);
    (replay[0]!.payload as { type: "text"; data: string }).data = "mutated";
    expect(store.replay(run.id, 0, 512)[0]!.payload).toEqual(first);
    expect(store.replay(run.id, 1, 512)[0]!.seq).toBe(2);
  });

  it("replays durable workspace and tool-progress events without losing their payloads", () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession(
      "alice",
      "chat:workspace-events",
      "interactive",
    );
    const run = store.createRun(session.id, "hello", "interactive", trigger);
    const events: readonly AgentEvent[] = [
      {
        type: "tool_progress",
        data: { id: "progress-1", kind: "search", payload: { completed: 1 } },
      },
      {
        type: "workspace_changed",
        data: { changes: [{ rel_path: "report.md", kind: "created" }] },
      },
      { type: "context_usage", data: 42 },
    ];

    for (const event of events) store.appendEvent(run.id, event);

    expect(store.replay(run.id, 0, 512).map((event) => event.payload)).toEqual(
      events,
    );
  });

  it("updates committed interactive history immutably", () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession(
      "alice",
      "chat:one",
      "interactive",
    );
    const history = [{ role: "user" as const, content: "hello" }];
    const updated = store.commitSession(session.id, { history });
    history[0]!.content = "changed";
    expect(updated.turns).toBe(1);
    expect(store.getSession(session.id)?.history[0]).toEqual({
      role: "user",
      content: "hello",
    });
  });

  it("keeps pending approval metadata without retaining raw tool arguments", () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession(
      "alice",
      "chat:one",
      "interactive",
    );
    const updated = store.commitSession(session.id, {
      history: [],
      pendingApproval: {
        approvalId: "approval-1",
        runId: "run-1",
        toolCallId: "write-1",
        action: "Write",
        argumentsHash: "sha256:abc",
        preview: "report.md",
        expiresAt: "2026-09-15T00:05:00.000Z",
      },
    });

    expect(updated.pendingApproval).toMatchObject({ approvalId: "approval-1" });
    expect(JSON.stringify(updated)).not.toContain("secret report");
  });

  it("stores a structured loop snapshot independently of the public transcript", () => {
    const store = new InMemoryRuntimeStore();
    const session = store.getOrCreateSession(
      "alice",
      "chat:one",
      "interactive",
    );
    const snapshot = {
      version: 1,
      iteration: 2,
      pendingToolCallIds: ["call-1"],
    };

    store.saveLoopSnapshot(session.id, snapshot);
    snapshot.pendingToolCallIds.push("mutated");

    expect(store.getLoopSnapshot(session.id)).toEqual({
      version: 1,
      iteration: 2,
      pendingToolCallIds: ["call-1"],
    });
  });
});

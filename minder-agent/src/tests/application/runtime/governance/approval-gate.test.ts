import { createHash } from "node:crypto";
import type { ToolPort } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  createApprovalService,
  createMemoryApprovalStore,
  createRuntimeApprovalGate,
} from "@application/runtime";
import { sha256 } from "@infrastructure/crypto/sha256.js";

const writeTool: ToolPort = {
  descriptor: {
    name: "Write",
    description: "Write a file.",
    parameters: { type: "object" },
    category: "write",
    readOnly: false,
    destructive: false,
    aliases: [],
  },
  async execute() {
    return { success: true, content: "written", metadata: {} };
  },
};

describe("runtime approval gate", () => {
  it("persists only a hashed, redacted request for a mutable tool", async () => {
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
      ids: () => "approval-1",
      now: () => "2026-09-15T00:00:00.000Z",
    });
    const gate = createRuntimeApprovalGate({
      owner: "alice",
      runId: "run-1",
      approvalService: approvals,
      sha256,
      redactor: () => "report.md",
      now: () => "2026-09-15T00:00:00.000Z",
    });

    const result = await gate({
      call: {
        id: "write-1",
        name: "Write",
        arguments: { content: "secret report", file_path: "report.md" },
      },
      tool: writeTool,
    });

    const expectedHash = `sha256:${createHash("sha256")
      .update('{"content":"secret report","file_path":"report.md"}')
      .digest("hex")}`;
    expect(result).toEqual({
      kind: "pause",
      request: {
        approvalId: "approval-1",
        toolCallId: "write-1",
        action: "Write",
        argumentsHash: expectedHash,
        preview: "report.md",
        expiresAt: "2026-09-15T00:05:00.000Z",
      },
    });
    expect(
      JSON.stringify(await approvals.list({ owner: "alice", runId: "run-1" })),
    ).not.toContain("secret report");
  });

  it("does not request approval for a read-only descriptor", async () => {
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
    });
    const gate = createRuntimeApprovalGate({
      owner: "alice",
      runId: "run-1",
      approvalService: approvals,
      sha256,
      redactor: () => "redacted",
    });

    await expect(
      gate({
        call: { id: "read-1", name: "Read", arguments: { path: "report.md" } },
        tool: {
          ...writeTool,
          descriptor: { ...writeTool.descriptor, name: "Read", readOnly: true },
        },
      }),
    ).resolves.toEqual({ kind: "allow" });
    await expect(
      approvals.list({ owner: "alice", runId: "run-1" }),
    ).resolves.toEqual([]);
  });

  it("does not pause an explicitly auto-approved mutable descriptor", async () => {
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
    });
    const gate = createRuntimeApprovalGate({
      owner: "alice",
      runId: "run-1",
      approvalService: approvals,
      sha256,
      redactor: () => "redacted",
      autoApprovals: ["Write"],
    });

    await expect(
      gate({
        call: { id: "write-1", name: "Write", arguments: {} },
        tool: writeTool,
      }),
    ).resolves.toEqual({ kind: "allow" });
    await expect(
      approvals.list({ owner: "alice", runId: "run-1" }),
    ).resolves.toEqual([]);
  });
});

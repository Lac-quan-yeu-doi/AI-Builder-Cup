import type { ToolApprovalGate } from "@application/agent";
import { describe, expect, it } from "vitest";

describe("ToolApprovalGate", () => {
  it("allows consumers to pause a resolved tool call with a durable approval request", async () => {
    const gate: ToolApprovalGate = async ({ call, tool }) => ({
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

    await expect(
      gate({
        call: { id: "call-1", name: "Write", arguments: {} },
        tool: {
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
            return { success: true, content: "written", metadata: {} };
          },
        },
      }),
    ).resolves.toEqual({
      kind: "pause",
      request: {
        approvalId: "approval-1",
        toolCallId: "call-1",
        action: "Write",
        argumentsHash: "sha256:abc",
        preview: "report.md",
        expiresAt: "2026-09-15T00:05:00.000Z",
      },
    });
  });
});

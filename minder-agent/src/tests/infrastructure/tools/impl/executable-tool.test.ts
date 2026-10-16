import type { ToolExecutionContext } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  allowAll,
  boundToolResult,
  executableTool,
} from "@infrastructure/tools/impl/index.js";

const descriptor = {
  name: "Echo",
  description: "Echoes input.",
  parameters: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  },
  category: "read" as const,
  readOnly: true,
  destructive: false,
  aliases: [],
};

function context(signal?: AbortSignal): ToolExecutionContext {
  return {
    workspace: "/tmp" as never,
    signal: signal ?? new AbortController().signal,
    values: new Map(),
  };
}

describe("executableTool", () => {
  it("validates arguments against the descriptor schema", async () => {
    const tool = executableTool(descriptor, allowAll, async () => ({
      success: true,
      content: "unreached",
      metadata: {},
    }));
    await expect(tool.execute({}, context())).resolves.toMatchObject({
      success: false,
      metadata: { code: "tool_invalid_arguments" },
    });
  });

  it("halts on a pre-aborted signal before executing", async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const tool = executableTool(descriptor, allowAll, async () => {
      called = true;
      return { success: true, content: "", metadata: {} };
    });
    const result = await tool.execute(
      { value: "x" },
      context(controller.signal),
    );
    expect(result).toMatchObject({
      success: false,
      metadata: { code: "tool_cancelled" },
    });
    expect(called).toBe(false);
  });

  it("bounds oversized output and reports overflow", () => {
    const result = boundToolResult(
      { success: true, content: "a".repeat(100), metadata: {} },
      16,
    );
    expect(result.content.length).toBeLessThanOrEqual(16);
    expect(result.overflow).toBeDefined();
  });

  it("returns structured results with content and metadata", async () => {
    const tool = executableTool(descriptor, allowAll, async (args) => ({
      success: true,
      content: `echo:${typeof args.value === "string" ? args.value : ""}`,
      metadata: { length: 1 },
    }));
    await expect(
      tool.execute({ value: "hi" }, context()),
    ).resolves.toMatchObject({
      success: true,
      content: "echo:hi",
      metadata: { length: 1 },
    });
  });
});

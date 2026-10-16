import type { ToolExecutionContext } from "@application/shared/ports/index.js";
import { describe, expect, it, vi } from "vitest";
import {
  allowAll,
  denyAll,
  executableTool,
} from "@infrastructure/tools/impl/index.js";

const descriptor = {
  name: "Probe",
  description: "A probe tool.",
  parameters: { type: "object", properties: {}, required: [] },
  category: "read" as const,
  readOnly: true,
  destructive: false,
  aliases: [],
};

function context(): ToolExecutionContext {
  return {
    workspace: "/tmp" as never,
    signal: new AbortController().signal,
    values: new Map(),
  };
}

describe("tool policy", () => {
  it("rejects a denied tool request before calling its executor", async () => {
    const execute = vi.fn();
    const tool = executableTool(descriptor, denyAll, execute);
    await expect(tool.execute({}, context())).resolves.toMatchObject({
      success: false,
      metadata: { code: "tool_denied" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows a permitted tool request to reach its executor", async () => {
    const execute = vi.fn(async () => ({
      success: true,
      content: "ok",
      metadata: {},
    }));
    const tool = executableTool(descriptor, allowAll, execute);
    await expect(tool.execute({}, context())).resolves.toMatchObject({
      success: true,
      content: "ok",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

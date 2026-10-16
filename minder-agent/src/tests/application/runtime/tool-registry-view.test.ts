import { describe, expect, it } from "vitest";
import {
  EmptyToolRegistry,
  ToolRegistryView,
  type MinderTool,
  type ToolContext,
} from "@application/shared/ports";
import { ToolRegistry } from "@infrastructure/tools/core";

const context: ToolContext = {
  workspaceRoot: "/workspace",
  workingDirectory: "/workspace",
  signal: new AbortController().signal,
};

function mounted(name: string, output: string): MinderTool {
  return {
    name,
    description: name,
    parameters: { type: "object" },
    async execute() {
      return { success: true, output, metadata: {} };
    },
  };
}

describe("ToolRegistryView", () => {
  it("executes mounted tools through direct and chained views", async () => {
    const base = new EmptyToolRegistry();
    const mcp = mounted("mcp_query", "mcp result");
    const optional = mounted("skill_report", "skill result");
    const mcpView = new ToolRegistryView(base, [mcp]);
    const chainedView = new ToolRegistryView(mcpView, [mcp, optional]);

    await expect(mcpView.execute(mcp.name, {}, context)).resolves.toMatchObject(
      {
        success: true,
        output: "mcp result",
      },
    );
    await expect(
      chainedView.execute(optional.name, {}, context),
    ).resolves.toMatchObject({ success: true, output: "skill result" });
    await expect(
      chainedView.execute("hidden", {}, context),
    ).resolves.toMatchObject({
      success: false,
      output: "Unknown tool: hidden.",
    });
  });

  it("routes mounted tools through the wrapped registry pipeline", async () => {
    let executed = false;
    const observed: string[] = [];
    const mcp = {
      ...mounted("mcp_query", "token=secret-value"),
      parameters: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
      readOnly: false,
      async execute() {
        executed = true;
        return { success: true, output: "token=secret-value", metadata: {} };
      },
    } satisfies MinderTool;
    const base = new ToolRegistry([mounted("Read", "base")], {
      policy: async ({ name }) =>
        name === mcp.name
          ? { allowed: false, reason: "MCP policy denied." }
          : { allowed: true },
      redact: (output) => output.replace("secret-value", "[REDACTED]"),
    });
    const view = new ToolRegistryView(base, [mcp]);

    expect(
      view.definitions().map((definition) => definition.function.name),
    ).toEqual([mcp.name]);
    await expect(view.execute(mcp.name, {}, context)).resolves.toEqual({
      success: false,
      output: "query is required.",
      metadata: {},
    });
    await expect(
      view.execute(
        mcp.name,
        { query: "select 1" },
        {
          ...context,
          onToolResult: (input) => {
            observed.push(input.name);
          },
        },
      ),
    ).resolves.toEqual({
      success: false,
      output: "MCP policy denied.",
      metadata: {},
    });
    expect(executed).toBe(false);
    expect(observed).toEqual([]);
  });

  it("preserves the pipeline for chained mounted views and includes definitions", async () => {
    const optional = mounted("skill_report", "token=secret-value");
    const base = new ToolRegistry([], {
      redact: (output) => output.replace("secret-value", "[REDACTED]"),
    });
    const view = new ToolRegistryView(
      new ToolRegistryView(base, [mounted("mcp_query", "mcp")]),
      [mounted("mcp_query", "mcp"), optional],
    );
    const observed: string[] = [];

    expect(
      view.definitions().map((definition) => definition.function.name),
    ).toEqual(["mcp_query", optional.name]);
    await expect(
      view.execute(
        optional.name,
        {},
        {
          ...context,
          onToolResult: (input) => {
            observed.push(input.name);
          },
        },
      ),
    ).resolves.toMatchObject({
      success: true,
      output: "token=[REDACTED]",
    });
    expect(observed).toEqual([optional.name]);
  });
});

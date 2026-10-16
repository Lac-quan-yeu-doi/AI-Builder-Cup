import { describe, expect, it } from "vitest";
import type {
  JsonObject,
  MinderTool,
  ToolContext,
} from "@infrastructure/tools/core/index.js";
import {
  ToolRegistry,
  ToolRegistryError,
} from "@infrastructure/tools/core/index.js";

const context: ToolContext = {
  workspaceRoot: process.cwd(),
  workingDirectory: process.cwd(),
  signal: new AbortController().signal,
};

function tool(name: string, parameters: JsonObject): MinderTool {
  return {
    name,
    description: `${name} tool`,
    parameters,
    async execute() {
      return { success: true, output: "ok", metadata: {} };
    },
  };
}

describe("ToolRegistry", () => {
  it("rejects duplicate names and resolves registered tools", () => {
    expect(
      () =>
        new ToolRegistry([
          tool("Read", { type: "object" }),
          tool("Read", { type: "object" }),
        ]),
    ).toThrow(ToolRegistryError);
    const registry = new ToolRegistry([tool("Read", { type: "object" })]);
    expect(registry.get("Read")?.name).toBe("Read");
    expect(registry.get("AskUser")).toBeUndefined();
  });

  it("validates required argument types before execution", async () => {
    const registry = new ToolRegistry([
      tool("Read", {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      }),
    ]);
    await expect(registry.execute("Read", {}, context)).resolves.toMatchObject({
      success: false,
      output: "file_path is required.",
    });
    await expect(
      registry.execute("Read", { file_path: 3 }, context),
    ).resolves.toMatchObject({
      success: false,
      output: "file_path must be a string.",
    });
    await expect(
      registry.execute("Missing", {}, context),
    ).resolves.toMatchObject({ success: false });
  });

  it("uses a tool's configured output limit instead of truncating its result", async () => {
    const output = "skill instruction ".repeat(700);
    const registry = new ToolRegistry([
      {
        ...tool("InvokeSkill", { type: "object" }),
        outputLimit: 40_000,
        async execute() {
          return { success: true, output, metadata: {} };
        },
      },
    ]);

    await expect(
      registry.execute("InvokeSkill", {}, context),
    ).resolves.toMatchObject({ success: true, output });
  });

  it("denies policy-rejected execution before a tool can run and redacts output centrally", async () => {
    let executed = false;
    const registry = new ToolRegistry(
      [
        {
          ...tool("Dangerous", { type: "object" }),
          async execute() {
            executed = true;
            return {
              success: true,
              output: "token=secret-value",
              metadata: {},
            };
          },
        },
      ],
      {
        policy: async () => ({
          allowed: false,
          reason: "Caller is not allowed to use Dangerous.",
        }),
        redact: (output) => output.replace("secret-value", "[REDACTED]"),
      },
    );

    await expect(registry.execute("Dangerous", {}, context)).resolves.toEqual({
      success: false,
      output: "Caller is not allowed to use Dangerous.",
      metadata: {},
    });
    expect(executed).toBe(false);

    const allowed = new ToolRegistry([tool("Safe", { type: "object" })], {
      redact: (output) => output.replace("ok", "[REDACTED]"),
    });
    await expect(allowed.execute("Safe", {}, context)).resolves.toMatchObject({
      output: "[REDACTED]",
    });
  });

  it("checks run-scoped governance before executing a validated tool", async () => {
    let executed = false;
    const registry = new ToolRegistry([
      {
        ...tool("Write", { type: "object" }),
        readOnly: false,
        async execute() {
          executed = true;
          return { success: true, output: "written", metadata: {} };
        },
      },
    ]);
    const checked: string[] = [];

    const result = await registry.execute(
      "Write",
      {},
      {
        ...context,
        governance: {
          async check(input) {
            checked.push(`${input.name}:${String(input.readOnly)}`);
            return { allowed: false, reason: "governance budget exhausted" };
          },
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      output: "governance budget exhausted",
    });
    expect(executed).toBe(false);
    expect(checked).toEqual(["Write:false"]);
  });

  it("preserves a stable governance error code in denied tool metadata", async () => {
    const registry = new ToolRegistry([tool("Catalogs", { type: "object" })]);
    const result = await registry.execute(
      "Catalogs",
      {},
      {
        ...context,
        governance: {
          check: () => ({
            allowed: false,
            code: "policy_unavailable",
            reason:
              "Workspace access is temporarily unavailable. Please retry this request.",
          }),
        },
      },
    );

    expect(result).toEqual({
      success: false,
      output:
        "Workspace access is temporarily unavailable. Please retry this request.",
      metadata: { error_code: "policy_unavailable" },
    });
  });

  it("redacts common credentials before a tool result reaches the model", async () => {
    const registry = new ToolRegistry([
      {
        ...tool("Secrets", { type: "object" }),
        async execute() {
          return {
            success: true,
            output: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
            metadata: {},
          };
        },
      },
    ]);

    await expect(
      registry.execute("Secrets", {}, context),
    ).resolves.toMatchObject({
      output: "Authorization: [REDACTED]",
    });
  });
  it("notifies the trusted execution context after a tool result", async () => {
    const observed: string[] = [];
    const registry = new ToolRegistry([tool("Read", { type: "object" })]);

    await registry.execute(
      "Read",
      {},
      {
        ...context,
        onToolResult: (input) => {
          observed.push(`${input.name}:${String(input.result.success)}`);
        },
      },
    );

    expect(observed).toEqual(["Read:true"]);
  });
});

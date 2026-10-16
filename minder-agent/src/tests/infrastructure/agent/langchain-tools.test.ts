import type { ToolPort } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import { toolPortsToLangChainTools } from "@infrastructure/agent/langchain/tools.js";

const descriptor = {
  name: "Lookup",
  description: "Look something up",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  category: "read" as const,
  readOnly: true,
  destructive: false,
  aliases: [],
};

describe("toolPortsToLangChainTools", () => {
  it("keeps the descriptor and executes through the ToolPort", async () => {
    let receivedArgs: unknown;
    let receivedSignal: AbortSignal | undefined;
    const port: ToolPort = {
      descriptor,
      async execute(args, context) {
        receivedArgs = args;
        receivedSignal = context.signal;
        return { success: true, content: "found", metadata: {} };
      },
    };
    const [wrapped] = toolPortsToLangChainTools([port]);
    const controller = new AbortController();

    const result = await wrapped!.invoke(
      { query: "cats" },
      { signal: controller.signal },
    );

    expect(result).toBe("found");
    expect(receivedArgs).toEqual({ query: "cats" });
    expect(receivedSignal).toBe(controller.signal);
    expect(wrapped!.name).toBe("Lookup");
    expect(wrapped!.description).toBe("Look something up");
  });

  it("returns failed ToolPort content without bypassing the tool boundary", async () => {
    const port: ToolPort = {
      descriptor,
      async execute() {
        return { success: false, content: "out of scope", metadata: {} };
      },
    };
    const [wrapped] = toolPortsToLangChainTools([port]);

    await expect(wrapped!.invoke({ query: "secret" })).resolves.toBe(
      "out of scope",
    );
  });
});

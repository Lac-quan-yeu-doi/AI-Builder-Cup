import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";

export interface AgentSpawner {
  spawn(input: {
    readonly agent: string;
    readonly input: string;
  }): Promise<{ runId: string }>;
}

const descriptor: ToolDescriptor = {
  name: "SpawnAgent",
  description: "Spawn a child agent run.",
  parameters: {
    type: "object",
    properties: { agent: { type: "string" }, input: { type: "string" } },
    required: ["agent", "input"],
  },
  category: "meta",
  readOnly: false,
  destructive: false,
  aliases: [],
};

/** Executable SpawnAgent tool that delegates to a room-aware spawner. */
export function createAgentTool(
  spawner: AgentSpawner,
  policy: ToolPolicy = allowAll,
) {
  return executableTool(descriptor, policy, async (args) => {
    const { runId } = await spawner.spawn({
      agent: requiredStringArgument(args, "agent"),
      input: requiredStringArgument(args, "input"),
    });
    return {
      success: true,
      content: `Spawned agent run ${runId}.`,
      metadata: { runId },
    };
  });
}

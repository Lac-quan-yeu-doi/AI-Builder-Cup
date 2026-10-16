import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";
import type { AgentSpawner } from "./agent-tools.js";

const planReviewDescriptor: ToolDescriptor = {
  name: "ProposePlan",
  description: "Propose a plan for durable client review before execution.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string" },
      steps: { type: "array" },
    },
    required: ["summary", "steps"],
  },
  category: "thinking",
  readOnly: true,
  destructive: false,
  aliases: [],
};

/**
 * Executable ProposePlan tool. It does not act; it records a plan that pauses
 * the run for durable client review. The runtime persists the pause before
 * publishing it (see the run manager's client/plan pause handling).
 */
export function createPlanReviewTool(policy: ToolPolicy = allowAll) {
  return executableTool(planReviewDescriptor, policy, (args) => {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    return Promise.resolve({
      success: true,
      content: `Plan proposed for review: ${requiredStringArgument(args, "summary")} (${steps.length} steps).`,
      metadata: { pause: "plan_review", stepCount: steps.length },
    });
  });
}

const spawnDescriptor: ToolDescriptor = {
  name: "SpawnAgent",
  description: "Spawn a scoped child agent run.",
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

/** Executable SpawnAgent tool delegating to a room-aware, scoped spawner. */
export function createSpawnAgentTool(
  spawner: AgentSpawner,
  policy: ToolPolicy = allowAll,
) {
  return executableTool(spawnDescriptor, policy, async (args) => {
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

export interface DashboardArtifactStore {
  saveArtifact(spec: string, title: string): Promise<string>;
}

const dashboardDescriptor: ToolDescriptor = {
  name: "WriteDashboard",
  description: "Persist a dashboard specification and return its handle.",
  parameters: {
    type: "object",
    properties: { title: { type: "string" }, spec: { type: "string" } },
    required: ["title", "spec"],
  },
  category: "meta",
  readOnly: false,
  destructive: false,
  aliases: [],
};

/**
 * Executable WriteDashboard tool. Specifications are stored as artifacts and the
 * tool returns a compact handle, so large dashboard specs never flood the run
 * transcript.
 */
export function createDashboardTool(
  store: DashboardArtifactStore,
  policy: ToolPolicy = allowAll,
) {
  return executableTool(dashboardDescriptor, policy, async (args) => {
    const title = requiredStringArgument(args, "title");
    const spec = requiredStringArgument(args, "spec");
    const artifactId = await store.saveArtifact(spec, title);
    return {
      success: true,
      content: `Dashboard '${title}' saved as ${artifactId} (${spec.length} bytes).`,
      metadata: { artifactId, title, bytes: spec.length },
    };
  });
}

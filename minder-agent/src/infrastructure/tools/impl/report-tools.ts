import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";

export interface ReportToolContracts {
  readonly names: readonly ["WriteReport"];
}

export interface ReportArtifactStore {
  saveArtifact(body: string, title: string): Promise<string>;
}

const descriptor: ToolDescriptor = {
  name: "WriteReport",
  description: "Persist a report artifact and return its handle.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      body: { type: "string" },
    },
    required: ["title", "body"],
  },
  category: "meta",
  readOnly: false,
  destructive: false,
  aliases: [],
};

/**
 * Executable WriteReport tool. Report bodies are stored as artifacts and the
 * tool returns a compact handle instead of an unbounded body, so large reports
 * never flood the run transcript.
 */
export function createReportTool(
  store: ReportArtifactStore,
  policy: ToolPolicy = allowAll,
) {
  return executableTool(descriptor, policy, async (args) => {
    const title = requiredStringArgument(args, "title");
    const body = requiredStringArgument(args, "body");
    const artifactId = await store.saveArtifact(body, title);
    return {
      success: true,
      content: `Report '${title}' saved as ${artifactId} (${body.length} bytes).`,
      metadata: { artifactId, title, bytes: body.length },
    };
  });
}

import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";

export interface StateToolContracts {
  readonly names: readonly ["ManageCapabilities", "SetApplicationState"];
}

const descriptor: ToolDescriptor = {
  name: "SetApplicationState",
  description: "Record a key/value entry in the run's application state.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string" },
      value: {},
    },
    required: ["key", "value"],
  },
  category: "session",
  readOnly: false,
  destructive: false,
  aliases: [],
};

/**
 * Executable SetApplicationState tool. It acknowledges the state mutation and
 * echoes the key in metadata so downstream consumers can correlate the write.
 */
export function createStateTool(policy: ToolPolicy = allowAll) {
  return executableTool(descriptor, policy, (args) => {
    const key = requiredStringArgument(args, "key");
    return Promise.resolve({
      success: true,
      content: `Application state '${key}' updated.`,
      metadata: { key, value: args.value ?? null },
    });
  });
}

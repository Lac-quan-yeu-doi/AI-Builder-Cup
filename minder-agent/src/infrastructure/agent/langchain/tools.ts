import type {
  ToolExecutionContext,
  ToolPort,
} from "@application/shared/ports/index.js";
import type { JsonObject, WorkspacePath } from "@domain/index.js";
import {
  tool,
  type StructuredToolInterface,
  type ToolRuntime,
} from "@langchain/core/tools";

export function toolPortsToLangChainTools(
  tools: readonly ToolPort[],
): readonly StructuredToolInterface[] {
  return tools.map((port) =>
    tool(
      async (args: JsonObject, runtime: ToolRuntime) => {
        const signal =
          runtime.signal ??
          runtime.config?.signal ??
          new AbortController().signal;
        const context: ToolExecutionContext = {
          workspace: "/" as WorkspacePath,
          signal,
          values: new Map(),
        };
        const result = await port.execute(args, context);
        return result.content;
      },
      {
        name: port.descriptor.name,
        description: port.descriptor.description,
        schema: port.descriptor.parameters,
      },
    ),
  ) as unknown as readonly StructuredToolInterface[];
}

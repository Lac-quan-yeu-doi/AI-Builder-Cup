import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';

/** One step in a tool chain: an existing MCP tool name plus its call arguments. */
export interface ToolChainStep {
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
}

/** Outcome of running one step of a chain. */
export interface ToolChainStepOutcome {
  readonly tool: string;
  readonly isError: boolean;
  readonly text: string;
}

export interface ToolChainOutcome {
  readonly steps: readonly ToolChainStepOutcome[];
  /** True when a serial chain stopped before running every step. Always false for `parallel`. */
  readonly stoppedEarly: boolean;
}

/**
 * Composes existing MCP tool handlers into one atomic multi-step call —
 * Foundry's `action.serial`/`action.parallel` chaining, adapted to compose
 * at the MCP tool-handler level (not raw `ActionDefinition.run()`) since
 * that's where per-action orchestration (e.g. `create_chart`'s SQL
 * submit-and-poll) actually lives.
 *
 * `serial` stops at the first failing step; `parallel` runs every step
 * regardless of the others' outcomes. Neither an unknown tool name nor a
 * throwing handler escapes as an exception — both become a failed step,
 * since this calls `handler.call()` directly and bypasses
 * `buildMcpToolServer`'s own try/catch wrapper.
 */
export async function runToolChain(
  steps: readonly ToolChainStep[],
  mode: 'serial' | 'parallel',
  toolsByName: ReadonlyMap<string, McpToolHandler>,
): Promise<ToolChainOutcome> {
  if (mode === 'parallel') {
    const results = await Promise.all(steps.map((step) => runStep(step, toolsByName)));
    return { steps: results, stoppedEarly: false };
  }

  const results: ToolChainStepOutcome[] = [];
  for (const step of steps) {
    const outcome = await runStep(step, toolsByName);
    results.push(outcome);
    if (outcome.isError) return { steps: results, stoppedEarly: true };
  }
  return { steps: results, stoppedEarly: false };
}

async function runStep(
  step: ToolChainStep,
  toolsByName: ReadonlyMap<string, McpToolHandler>,
): Promise<ToolChainStepOutcome> {
  const handler = toolsByName.get(step.tool);
  if (handler === undefined) {
    return { tool: step.tool, isError: true, text: `Unknown tool: ${step.tool}` };
  }
  try {
    const result = await handler.call(step.arguments);
    const block = result.content[0];
    const text = block !== undefined && block.type === 'text' ? block.text : '';
    return { tool: step.tool, isError: result.isError === true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tool: step.tool, isError: true, text: message };
  }
}

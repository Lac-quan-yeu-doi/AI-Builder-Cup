import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { runToolChain } from '@presentation/mcp/tool-chain';

function fakeTool(
  name: string,
  behavior: (args: Record<string, unknown>) => Promise<{ isError?: boolean; text: string }>,
): McpToolHandler {
  return {
    tool: { name, description: name, inputSchema: { type: 'object', properties: {} } },
    call: async (args) => {
      const outcome = await behavior(args);
      return { content: [{ type: 'text', text: outcome.text }], isError: outcome.isError };
    },
  };
}

function okTool(name: string): McpToolHandler {
  return fakeTool(name, async (args) => ({ text: JSON.stringify(args) }));
}

function failingTool(name: string, message: string): McpToolHandler {
  return fakeTool(name, async () => ({ isError: true, text: message }));
}

function throwingTool(name: string, message: string): McpToolHandler {
  return {
    tool: { name, description: name, inputSchema: { type: 'object', properties: {} } },
    call: async () => {
      throw new Error(message);
    },
  };
}

describe('runToolChain', () => {
  it('runs every step in order and reports success for a fully-passing serial chain', async () => {
    const toolsByName = new Map([
      ['step_a', okTool('step_a')],
      ['step_b', okTool('step_b')],
    ]);
    const outcome = await runToolChain(
      [
        { tool: 'step_a', arguments: { x: 1 } },
        { tool: 'step_b', arguments: { y: 2 } },
      ],
      'serial',
      toolsByName,
    );
    expect(outcome.stoppedEarly).toBe(false);
    expect(outcome.steps).toEqual([
      { tool: 'step_a', isError: false, text: '{"x":1}' },
      { tool: 'step_b', isError: false, text: '{"y":2}' },
    ]);
  });

  it('stops a serial chain at the first failing step and skips the rest', async () => {
    const toolsByName = new Map([
      ['step_a', okTool('step_a')],
      ['step_b', failingTool('step_b', 'boom')],
      ['step_c', okTool('step_c')],
    ]);
    const outcome = await runToolChain(
      [
        { tool: 'step_a', arguments: {} },
        { tool: 'step_b', arguments: {} },
        { tool: 'step_c', arguments: {} },
      ],
      'serial',
      toolsByName,
    );
    expect(outcome.stoppedEarly).toBe(true);
    expect(outcome.steps).toEqual([
      { tool: 'step_a', isError: false, text: '{}' },
      { tool: 'step_b', isError: true, text: 'boom' },
    ]);
  });

  it('catches a throwing handler as a failed step instead of rejecting the chain', async () => {
    const toolsByName = new Map([['step_a', throwingTool('step_a', 'exploded')]]);
    const outcome = await runToolChain([{ tool: 'step_a', arguments: {} }], 'serial', toolsByName);
    expect(outcome.stoppedEarly).toBe(true);
    expect(outcome.steps).toEqual([{ tool: 'step_a', isError: true, text: 'exploded' }]);
  });

  it('reports an unknown tool name as a failed step rather than throwing', async () => {
    const toolsByName = new Map([['step_a', okTool('step_a')]]);
    const outcome = await runToolChain([{ tool: 'nope', arguments: {} }], 'serial', toolsByName);
    expect(outcome.stoppedEarly).toBe(true);
    expect(outcome.steps).toEqual([{ tool: 'nope', isError: true, text: 'Unknown tool: nope' }]);
  });

  it('runs every step of a parallel chain regardless of individual failures', async () => {
    const toolsByName = new Map([
      ['step_a', okTool('step_a')],
      ['step_b', failingTool('step_b', 'boom')],
      ['step_c', okTool('step_c')],
    ]);
    const outcome = await runToolChain(
      [
        { tool: 'step_a', arguments: {} },
        { tool: 'step_b', arguments: {} },
        { tool: 'step_c', arguments: {} },
      ],
      'parallel',
      toolsByName,
    );
    expect(outcome.stoppedEarly).toBe(false);
    expect(outcome.steps).toEqual([
      { tool: 'step_a', isError: false, text: '{}' },
      { tool: 'step_b', isError: true, text: 'boom' },
      { tool: 'step_c', isError: false, text: '{}' },
    ]);
  });
});

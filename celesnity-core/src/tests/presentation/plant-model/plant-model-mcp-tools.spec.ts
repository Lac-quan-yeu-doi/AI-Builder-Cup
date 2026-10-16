import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import { buildPlantModelMcpTools } from '@presentation/plant-model/plant-model-mcp-tools';

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text') throw new Error('expected text');
  return block.text;
}

function useCases() {
  return {
    listNodes: jest.fn().mockResolvedValue({ nodes: [{ id: 'node-a', name: 'Filler A' }] }),
    getNode: jest.fn().mockResolvedValue({ id: 'node-a', name: 'Filler A', properties: [] }),
    traverseRoutes: jest
      .fn()
      .mockResolvedValue({ originNodeId: 'node-a', nodes: [{ id: 'node-b' }] }),
    resolveNodeCatalogProperty: jest.fn().mockResolvedValue({ resolution: { value: 'running' } }),
  } as unknown as PlantModelUseCases;
}

function findTool(
  tools: readonly ReturnType<typeof buildPlantModelMcpTools>[number][],
  name: string,
) {
  const tool = tools.find((candidate) => candidate.tool.name === name);
  if (tool === undefined) throw new Error(`tool ${name} not found`);
  return tool;
}

describe('Plant Model MCP tools', () => {
  it('exposes bounded list, detail, and route traversal tools', () => {
    const tools = buildPlantModelMcpTools(useCases());
    expect(tools.map(({ tool }) => tool.name)).toEqual([
      'list_plant_model_nodes',
      'get_plant_model_node',
      'traverse_plant_model_routes',
      'resolve_plant_model_catalog_property',
    ]);
    for (const { tool } of tools) {
      expect(tool.inputSchema.properties).not.toHaveProperty('site_id');
      expect(tool.inputSchema.required ?? []).not.toContain('site_id');
    }
  });

  it('resolves a catalog property by IDs without accepting a caller supplied binding', async () => {
    const context = useCases();
    const result = await findTool(
      buildPlantModelMcpTools(context),
      'resolve_plant_model_catalog_property',
    ).call({
      site_id: 'site-a',
      node_id: 'node-a',
      property_definition_id: 'status-property',
    });
    expect(context.resolveNodeCatalogProperty).toHaveBeenCalledWith(
      'site-a',
      'node-a',
      'status-property',
    );
    expect(textOf(result)).toContain('running');
  });

  it('passes list filters and pagination to the use case', async () => {
    const context = useCases();
    const result = await findTool(buildPlantModelMcpTools(context), 'list_plant_model_nodes').call({
      site_id: 'site-a',
      query: 'filler',
      limit: 10,
      offset: 20,
    });
    expect(context.listNodes).toHaveBeenCalledWith('site-a', {
      query: 'filler',
      nodeTypeId: undefined,
      routingRole: undefined,
      limit: 10,
      offset: 20,
    });
    expect(textOf(result)).toContain('Filler A');
  });

  it('requires site and node ids for detail and traversal', async () => {
    const context = useCases();
    const tools = buildPlantModelMcpTools(context);
    expect((await findTool(tools, 'get_plant_model_node').call({})).isError).toBe(true);
    expect(
      (await findTool(tools, 'traverse_plant_model_routes').call({ site_id: 'site-a' })).isError,
    ).toBe(true);
    expect(context.getNode).not.toHaveBeenCalled();
    expect(context.traverseRoutes).not.toHaveBeenCalled();
  });
});

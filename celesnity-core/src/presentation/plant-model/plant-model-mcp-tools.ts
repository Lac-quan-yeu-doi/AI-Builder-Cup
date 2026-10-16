import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { toInputSchema, toolError, toolResult } from '@presentation/mcp/mcp-tool-server';

export function buildPlantModelMcpTools(useCases: PlantModelUseCases): readonly McpToolHandler[] {
  return [
    {
      tool: {
        name: 'list_plant_model_nodes',
        description:
          'Search and page through concise node summaries in the active Plant Model. The application-selected site is injected automatically. Use this first to find node IDs; results are bounded and do not include full property definitions.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional case-insensitive node or node-type name search.',
            },
            node_type_id: { type: 'string', description: 'Optional exact node-type UUID.' },
            routing_role: { type: 'string', enum: ['source', 'intermediate', 'sink', 'none'] },
            offset: { type: 'integer', minimum: 0, maximum: 10000, default: 0 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
          },
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const siteId = requiredString(args, 'site_id');
        if (siteId === undefined) return toolError('Missing required argument: site_id');
        const result = await useCases.listNodes(siteId, {
          query: optionalString(args, 'query'),
          nodeTypeId: optionalString(args, 'node_type_id'),
          routingRole: optionalString(args, 'routing_role'),
          offset: optionalInteger(args, 'offset'),
          limit: optionalInteger(args, 'limit'),
        });
        return toolResult(JSON.stringify(result, null, 2));
      },
    },
    {
      tool: {
        name: 'get_plant_model_node',
        description:
          'Get one node in the active Plant Model with its typed properties, catalog bindings, parent/child counts, and directly connected relationships. The currently selected node is used when node_id is omitted.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            node_id: { type: 'string', description: 'Exact plant node UUID.' },
          },
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const siteId = requiredString(args, 'site_id');
        const nodeId = requiredString(args, 'node_id');
        if (siteId === undefined) return toolError('Missing required argument: site_id');
        if (nodeId === undefined) return toolError('Missing required argument: node_id');
        return toolResult(JSON.stringify(await useCases.getNode(siteId, nodeId), null, 2));
      },
    },
    {
      tool: {
        name: 'traverse_plant_model_routes',
        description:
          'Read a bounded upstream, downstream, or bidirectional route neighborhood in the active Plant Model. The currently selected node is used when node_id is omitted.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            node_id: { type: 'string', description: 'Origin plant node UUID.' },
            direction: {
              type: 'string',
              enum: ['upstream', 'downstream', 'both'],
              default: 'both',
            },
            depth: { type: 'integer', minimum: 1, maximum: 5, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const siteId = requiredString(args, 'site_id');
        const nodeId = requiredString(args, 'node_id');
        if (siteId === undefined) return toolError('Missing required argument: site_id');
        if (nodeId === undefined) return toolError('Missing required argument: node_id');
        return toolResult(
          JSON.stringify(
            await useCases.traverseRoutes(siteId, nodeId, {
              direction: optionalString(args, 'direction'),
              depth: optionalInteger(args, 'depth'),
              limit: optionalInteger(args, 'limit'),
            }),
            null,
            2,
          ),
        );
      },
    },
    {
      tool: {
        name: 'resolve_plant_model_catalog_property',
        description:
          'Resolve the current live scalar value for one catalog-backed property in the active Plant Model. The currently selected node is used when node_id is omitted. First use get_plant_model_node to identify the property definition ID.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            node_id: { type: 'string', description: 'Exact plant node UUID.' },
            property_definition_id: {
              type: 'string',
              description: 'Exact property definition UUID returned by get_plant_model_node.',
            },
          },
          required: ['property_definition_id'],
        }),
      },
      call: async (args): Promise<CallToolResult> => {
        const siteId = requiredString(args, 'site_id');
        const nodeId = requiredString(args, 'node_id');
        const propertyDefinitionId = requiredString(args, 'property_definition_id');
        if (siteId === undefined) return toolError('Missing required argument: site_id');
        if (nodeId === undefined) return toolError('Missing required argument: node_id');
        if (propertyDefinitionId === undefined) {
          return toolError('Missing required argument: property_definition_id');
        }
        return toolResult(
          JSON.stringify(
            await useCases.resolveNodeCatalogProperty(siteId, nodeId, propertyDefinitionId),
            null,
            2,
          ),
        );
      },
    },
  ];
}

function requiredString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function optionalInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

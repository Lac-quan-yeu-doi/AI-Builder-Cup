import { describe, expect, it } from 'vitest';

import { buildPlantModelToolScope } from '@/app/(workspace)/plant-model/[siteId]/_components/plant-model-tool-scope';
import type { PlantModelDraft, PlantSite } from '@/src/entities/models/plant-model';

describe('Plant Model chat context', () => {
  it('sends constant-size site and selection scope without embedding graph data', () => {
    const draft: PlantModelDraft = {
      nodeTypes: [
        {
          id: 'type-1',
          name: 'Machine',
          properties: [
            {
              id: 'status-id',
              key: 'status',
              name: 'Status',
              type: 'catalog-scalar',
              required: false,
              order: 0,
              catalogBinding: {
                mode: 'scalar',
                catalog: 'iceberg',
                schema: 'operations',
                table: 'machine_status',
                valueColumn: 'status',
                filters: [],
              },
            },
          ],
        },
      ],
      nodes: [
        {
          id: 'machine-a',
          name: 'Machine A',
          nodeTypeId: 'type-1',
          routingRole: 'source',
          position: { x: 0, y: 0 },
          values: { 'status-id': 'running' },
          localProperties: [],
        },
        {
          id: 'machine-b',
          name: 'Machine B',
          nodeTypeId: 'type-1',
          routingRole: 'sink',
          position: { x: 200, y: 0 },
          values: {},
          localProperties: [],
        },
      ],
      relationships: [
        {
          id: 'route-1',
          kind: 'routes-to',
          sourceNodeId: 'machine-a',
          targetNodeId: 'machine-b',
        },
      ],
    };
    const site = {
      id: 'site-1',
      name: 'Factory 1',
      code: 'F1',
      timezone: 'Asia/Ho_Chi_Minh',
      draft,
      revision: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } satisfies PlantSite;

    const context = buildPlantModelToolScope(site, 'machine-a');

    expect(context.plantSiteId).toBe('site-1');
    expect(context.selectedNodeId).toBe('machine-a');
    expect(context.draftRevision).toBe(3);
    expect(context).not.toHaveProperty('nodes');
    expect(context).not.toHaveProperty('relationships');
    expect(JSON.stringify(context)).not.toContain('machine_status');
    expect(JSON.stringify(context)).not.toContain('running');

    const relationshipContext = buildPlantModelToolScope(site, undefined, 'route-1');
    expect(relationshipContext.selectedRelationshipId).toBe('route-1');

    const dashboardContext = buildPlantModelToolScope(site, undefined, undefined, 'dashboard-1');
    expect(dashboardContext.selectedDashboardId).toBe('dashboard-1');
  });
});

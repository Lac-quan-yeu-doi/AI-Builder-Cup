import { BadRequestException } from '@nestjs/common';

import { ChartActionsCatalogController } from '@presentation/actions/chart-actions-catalog.controller';
import type { ActionDefinition } from '@application/actions/action.types';

function action(name: string, permission: 'read' | 'write'): ActionDefinition<unknown, unknown> {
  return {
    name,
    permission,
    auditRequired: false,
    approvalRequired: false,
    mcpTool: {
      name: `${name}_tool`,
      description: 'desc',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    run: (): Promise<unknown> => Promise.resolve(undefined),
  };
}

function buildController(): ChartActionsCatalogController {
  const actions = {
    read: action('chart.get', 'read'),
    write: action('chart.create', 'write'),
  };
  return new ChartActionsCatalogController(actions as never);
}

describe('ChartActionsCatalogController', () => {
  it('returns the full catalog when no filter is supplied', () => {
    const controller = buildController();

    const catalog = controller.mcpTools();

    expect(catalog.map((entry) => entry.action_name).sort()).toEqual(['chart.create', 'chart.get']);
  });

  it('filters by a single permission value', () => {
    const controller = buildController();

    const catalog = controller.mcpTools('read');

    expect(catalog.map((entry) => entry.action_name)).toEqual(['chart.get']);
  });

  it('filters by a repeated permission query param', () => {
    const controller = buildController();

    const catalog = controller.mcpTools(['read', 'write']);

    expect(catalog.map((entry) => entry.action_name).sort()).toEqual(['chart.create', 'chart.get']);
  });

  it('filters by action name', () => {
    const controller = buildController();

    const catalog = controller.mcpTools(undefined, 'chart.create');

    expect(catalog.map((entry) => entry.action_name)).toEqual(['chart.create']);
  });

  it('rejects an invalid permission value', () => {
    const controller = buildController();

    expect(() => controller.mcpTools('delete')).toThrow(BadRequestException);
  });
});

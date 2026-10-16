import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import type { ActionDefinition } from '@application/actions/action.types';
import { buildMcpCatalog, type McpToolCatalogEntry } from '@application/actions/mcp-catalog';
import type { ChartActions } from '@application/chart/chart.actions';
import { CHART_ACTIONS } from '@application/chart/chart.actions';
import { Public } from '@presentation/http/public.decorator';
import { CANONICAL_CHART_MCP_CATALOG } from '@application/chart/canonical-chart-action.catalog';

const VALID_PERMISSIONS = ['read', 'write'] as const;
type Permission = (typeof VALID_PERMISSIONS)[number];

/**
 * Serves the chart action registry's MCP tool catalog — the single source
 * of truth `mcp-chart` fetches at startup instead of hand-typing JSON
 * schemas that can (and did) drift from what `ChartActions` actually
 * accepts. See `chart.actions.ts` and `application/actions/mcp-catalog.ts`.
 *
 * `permission`/`action` let a caller restrict the catalog to a subset of
 * what it could otherwise expose (AIP's Workshop-widget "customize default
 * enabled tools" pattern) — e.g. a read-only embed asking for `?permission=read`
 * rather than being handed create/delete tools it will never call. Omitting
 * both keeps today's behavior: every registered action, unfiltered.
 */
@ApiTags('chart-actions')
@Controller('chart-actions')
export class ChartActionsCatalogController {
  public constructor(@Inject(CHART_ACTIONS) private readonly actions: ChartActions) {}

  @Get('mcp-tools')
  @Public()
  @ApiOperation({
    summary:
      'List chart actions exposed as MCP tools, with their JSON schemas — optionally scoped by permission and/or action name',
  })
  @ApiQuery({
    name: 'permission',
    required: false,
    isArray: true,
    enum: VALID_PERMISSIONS,
    description: 'Keep only actions at these permission levels. Repeatable.',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    isArray: true,
    type: String,
    description: 'Keep only these actions, by dotted name (e.g. "chart.create"). Repeatable.',
  })
  public mcpTools(
    @Query('permission') permission?: string | string[],
    @Query('action') action?: string | string[],
  ): readonly McpToolCatalogEntry[] {
    return buildMcpCatalog(
      this.actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
      {},
      {
        permissions: parsePermissions(permission),
        actionNames: toArray(action),
      },
    );
  }

  @Get('canonical-mcp-tools')
  @Public()
  @ApiOperation({ summary: 'List canonical chart MCP tools used by Chat-to-Chart' })
  public canonicalMcpTools(): readonly McpToolCatalogEntry[] {
    return CANONICAL_CHART_MCP_CATALOG;
  }
}

function toArray(value: string | string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function parsePermissions(value: string | string[] | undefined): readonly Permission[] | undefined {
  const values = toArray(value);
  if (values === undefined) return undefined;
  for (const v of values) {
    if (!VALID_PERMISSIONS.includes(v as Permission)) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION',
        message: `permission must be one of: ${VALID_PERMISSIONS.join(', ')}`,
        details: null,
      });
    }
  }
  return values as Permission[];
}

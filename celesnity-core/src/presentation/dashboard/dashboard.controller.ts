import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { ArchiveDashboardUseCase } from '@application/dashboard/archive-dashboard.use-case';
import { CopyDashboardUseCase } from '@application/dashboard/copy-dashboard.use-case';
import { CreateDashboardUseCase } from '@application/dashboard/create-dashboard.use-case';
import { GetDashboardUseCase } from '@application/dashboard/get-dashboard.use-case';
import type { DashboardPrincipal } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import { ListDashboardsUseCase } from '@application/dashboard/list-dashboards.use-case';
import { SaveDashboardUseCase } from '@application/dashboard/save-dashboard.use-case';
import { ExecuteDashboardUseCase } from '@application/dashboard/execute-dashboard.use-case';
import { ListDashboardFilterTargetsUseCase } from '@application/dashboard/list-dashboard-filter-targets.use-case';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import type { Dashboard } from '@domain/dashboard/models/dashboard';
import type { DashboardCard } from '@domain/dashboard/models/dashboard-card';
import type {
  DashboardFilter,
  DashboardFilterMapping,
} from '@domain/dashboard/models/dashboard-filter';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  CopyDashboardDto,
  CreateDashboardDto,
  ExecuteDashboardDto,
  PreviewDashboardFilterTargetsDto,
  SaveDashboardDto,
} from './dashboard.dto';
import {
  DashboardExecutionResponse,
  DashboardFilterTargetsResponse,
  DashboardResponse,
  DashboardSummaryResponse,
} from './dashboard.response';

@ApiTags('dashboards')
@Controller('dashboards')
@RequireWorkspaceFeature('ANALYTICS')
export class DashboardController {
  public constructor(
    private readonly createDashboard: CreateDashboardUseCase,
    private readonly getDashboard: GetDashboardUseCase,
    private readonly listDashboards: ListDashboardsUseCase,
    private readonly saveDashboard: SaveDashboardUseCase,
    private readonly copyDashboard: CopyDashboardUseCase,
    private readonly archiveDashboard: ArchiveDashboardUseCase,
    private readonly executeDashboard: ExecuteDashboardUseCase,
    private readonly listFilterTargets: ListDashboardFilterTargetsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a dashboard in a collection' })
  @ApiOkResponse({ type: DashboardResponse })
  public async create(
    @Body() dto: CreateDashboardDto,
    @Req() request: Request,
  ): Promise<DashboardResponse> {
    const principal = principalOf(request);
    return DashboardResponse.from(
      await this.createDashboard.execute({
        principal,
        collectionId: dto.collection_id,
        title: dto.name,
        description: dto.description ?? null,
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List dashboards in one authorized collection' })
  @ApiOkResponse({ type: DashboardSummaryResponse, isArray: true })
  public async list(
    @Query('collection_id') collectionId: string,
    @Req() request: Request,
  ): Promise<readonly DashboardSummaryResponse[]> {
    const summaries = await this.listDashboards.execute({
      principal: principalOf(request),
      collectionId,
    });
    return summaries.map((summary) => DashboardSummaryResponse.from(summary));
  }

  @Get(':dashboardId')
  @ApiOperation({ summary: 'Load a dashboard authoring aggregate' })
  @ApiOkResponse({ type: DashboardResponse })
  public async get(
    @Param('dashboardId') dashboardId: string,
    @Req() request: Request,
  ): Promise<DashboardResponse> {
    return DashboardResponse.from(
      await this.getDashboard.execute({ principal: principalOf(request), dashboardId }),
    );
  }

  @Post(':dashboardId/execute')
  @ApiOperation({ summary: 'Execute one dashboard tab with mapped filter values' })
  @ApiOkResponse({ type: DashboardExecutionResponse })
  public async execute(
    @Param('dashboardId') dashboardId: string,
    @Body() dto: ExecuteDashboardDto,
    @Req() request: Request,
  ): Promise<DashboardExecutionResponse> {
    validateDashboardExecutionBoundary(dto);
    return DashboardExecutionResponse.from(
      await this.executeDashboard.execute({
        principal: principalOf(request),
        dashboardId,
        tabId: dto.tab_id,
        values: dto.values,
        changedFilterIds: dto.changed_filter_ids,
      }),
    );
  }

  @Get(':dashboardId/filter-targets')
  @ApiOperation({ summary: 'List authorized compatible filter targets for dashboard cards' })
  @ApiOkResponse({ type: DashboardFilterTargetsResponse })
  public async filterTargets(
    @Param('dashboardId') dashboardId: string,
    @Req() request: Request,
  ): Promise<DashboardFilterTargetsResponse> {
    return DashboardFilterTargetsResponse.from(
      await this.listFilterTargets.execute({ principal: principalOf(request), dashboardId }),
    );
  }

  @Post(':dashboardId/filter-targets/preview')
  @ApiOperation({ summary: 'Preview authorized filter targets for an unsaved dashboard draft' })
  @ApiOkResponse({ type: DashboardFilterTargetsResponse })
  public async previewFilterTargets(
    @Param('dashboardId') dashboardId: string,
    @Body() dto: PreviewDashboardFilterTargetsDto,
    @Req() request: Request,
  ): Promise<DashboardFilterTargetsResponse> {
    return DashboardFilterTargetsResponse.from(
      await this.listFilterTargets.execute({
        principal: principalOf(request),
        dashboardId,
        chartCards: dto.cards.map((card) => ({
          cardId: card.card_id,
          chartId: card.chart_id,
        })),
      }),
    );
  }

  @Put(':dashboardId')
  @ApiOperation({ summary: 'Atomically save a complete dashboard draft' })
  @ApiOkResponse({ type: DashboardResponse })
  public async save(
    @Param('dashboardId') dashboardId: string,
    @Body() dto: SaveDashboardDto,
    @Req() request: Request,
  ): Promise<DashboardResponse> {
    const principal = principalOf(request);
    return DashboardResponse.from(
      await this.saveDashboard.execute({
        principal,
        dashboardId,
        expectedRevision: dto.expected_revision,
        draft: dashboardFromDto(dashboardId, principal, dto),
      }),
    );
  }

  @Post(':dashboardId/copies')
  @ApiOperation({ summary: 'Copy a retained dashboard draft' })
  @ApiOkResponse({ type: DashboardResponse })
  public async copy(
    @Param('dashboardId') dashboardId: string,
    @Body() dto: CopyDashboardDto,
    @Req() request: Request,
  ): Promise<DashboardResponse> {
    const principal = principalOf(request);
    return DashboardResponse.from(
      await this.copyDashboard.execute({
        principal,
        sourceDashboardId: dashboardId,
        collectionId: dto.collection_id,
        title: dto.name,
        draft: dashboardFromDto(dashboardId, principal, dto.draft),
      }),
    );
  }

  @Delete(':dashboardId')
  @ApiOperation({ summary: 'Archive a dashboard' })
  public async archive(
    @Param('dashboardId') dashboardId: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.archiveDashboard.execute({ principal: principalOf(request), dashboardId });
  }
}

function dashboardFromDto(
  dashboardId: string,
  principal: DashboardPrincipal,
  dto: SaveDashboardDto,
): Dashboard {
  return {
    id: dashboardId,
    organizationId: principal.organizationId,
    collectionId: dto.collection_id,
    title: dto.name,
    description: dto.description ?? null,
    revision: dto.expected_revision,
    tabs: dto.tabs,
    cards: dto.cards.map(cardFromDto),
    filters: dto.filters.map(filterFromDto),
    mappings: dto.mappings.map(mappingFromDto),
    createdByIdentityId: principal.identityId,
    archivedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function cardFromDto(dto: SaveDashboardDto['cards'][number]): DashboardCard {
  const base = { id: dto.id, tabId: dto.tab_id, geometry: dto.geometry };
  switch (dto.kind) {
    case 'CHART':
      return {
        ...base,
        kind: 'CHART',
        chartId: requiredText(dto.chart_id, 'Chart ID is required.'),
        chartRevisionNumber: dto.chart_revision_number ?? null,
        visualizationOverrides: dto.visualization_overrides ?? {},
      };
    case 'HEADING':
      return {
        ...base,
        kind: 'HEADING',
        content: { text: requiredText(dto.content?.text, 'Heading text is required.') },
      };
    case 'TEXT':
      return {
        ...base,
        kind: 'TEXT',
        content: { markdown: requiredText(dto.content?.markdown, 'Text content is required.') },
      };
    case 'LINK':
      return {
        ...base,
        kind: 'LINK',
        content: {
          label: requiredText(dto.content?.label, 'Link label is required.'),
          url: requiredText(dto.content?.url, 'Link URL is required.'),
        },
      };
    default:
      throw DashboardError.validation('Dashboard card kind is invalid.');
  }
}

function filterFromDto(dto: SaveDashboardDto['filters'][number]): DashboardFilter {
  const semanticType = dto.semantic_type;
  if (!isFilterSemanticType(semanticType)) {
    throw DashboardError.validation('Dashboard filter semantic type is invalid.');
  }
  return {
    id: dto.id,
    slug: dto.slug,
    label: dto.label,
    semanticType,
    operator: dto.operator,
    defaultValue: dto.default_value,
    required: dto.required,
    multiple: dto.multiple,
    valuesSource: dto.values_source,
    placement: placementFromDto(dto.placement),
    order: dto.order,
  };
}

function placementFromDto(
  dto: SaveDashboardDto['filters'][number]['placement'],
): DashboardFilter['placement'] {
  if (dto.kind === 'TOP_OF_PAGE') return { kind: 'TOP_OF_PAGE' };
  if (dto.kind === 'INLINE_CARD') {
    return {
      kind: 'INLINE_CARD',
      cardId: requiredText(dto.card_id, 'Inline placement card is required.'),
    };
  }
  throw DashboardError.validation('Dashboard filter placement is invalid.');
}

function mappingFromDto(dto: SaveDashboardDto['mappings'][number]): DashboardFilterMapping {
  const base = { filterId: dto.filter_id, cardId: dto.card_id };
  switch (dto.target.kind) {
    case 'FIELD':
      return {
        ...base,
        target: { kind: 'FIELD', fieldId: requiredText(dto.target.field_id, 'Field is required.') },
      };
    case 'NATIVE_QUERY_VARIABLE':
      return {
        ...base,
        target: {
          kind: 'NATIVE_QUERY_VARIABLE',
          variableKey: requiredText(dto.target.variable_key, 'Variable key is required.'),
        },
      };
    case 'CONTENT_VARIABLE':
      return {
        ...base,
        target: {
          kind: 'CONTENT_VARIABLE',
          variableName: requiredText(dto.target.variable_name, 'Variable name is required.'),
        },
      };
    default:
      throw DashboardError.validation('Dashboard filter target is invalid.');
  }
}

function isFilterSemanticType(value: string): value is DashboardFilter['semanticType'] {
  return [
    'DATE_PICKER',
    'TIME_GROUPING',
    'LOCATION',
    'TEXT_CATEGORY',
    'NUMBER',
    'BOOLEAN',
    'ID',
  ].includes(value);
}

function requiredText(value: string | undefined, message: string): string {
  if (value === undefined || value.trim().length === 0) throw DashboardError.validation(message);
  return value;
}

function validateDashboardExecutionBoundary(dto: ExecuteDashboardDto): void {
  if (Object.keys(dto.values).length > 100 || JSON.stringify(dto.values).length > 32_768) {
    throw DashboardError.validation('Dashboard filter values exceed the supported request size.');
  }
}

function principalOf(request: Request): DashboardPrincipal {
  const principal = requireAuthenticatedPrincipal(request);
  return {
    organizationId: principal.organizationId,
    identityId: principal.identityId,
    isOrganizationAdmin: ['PLATFORM_ADMIN', 'ORG_OWNER', 'ORG_ADMIN'].includes(principal.role),
  };
}

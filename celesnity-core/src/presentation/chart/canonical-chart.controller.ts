import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import {
  ChartAuthoringUseCases,
  type ChartActor,
  type ChartDraft,
} from '@application/chart/chart-authoring.use-cases';
import { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';
import { CHART_CAPABILITIES } from '@domain/chart/models/chart-capability';
import type { OutputColumn } from '@domain/chart/models/visualization-definition';
import type { QueryDefinition } from '@domain/chart/models/query-definition';
import type { VisualizationDefinition } from '@domain/chart/models/visualization-definition';
import type { Chart } from '@domain/chart/models/chart';
import type { ChartRunEvent } from '@application/chart/chart-query.executor';
import type { ActionActor } from '@application/actions/action.types';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { ACTION_AUDIT_LOG } from '@application/actions/tokens';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import {
  CHART_ACTIONS,
  type ChartActions,
  type CanonicalRemoveInput,
} from '@application/chart/chart.actions';
import { approvalOverrideFor } from '@presentation/http/action-approval-override';
import { runAction } from '@presentation/http/run-action';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { CanonicalChartAgentAuthGuard } from '@presentation/http/canonical-chart-agent-auth.guard';
import {
  CanonicalChartResponse,
  CanonicalChartRevisionResponse,
  CanonicalChartSummaryResponse,
  ChartQueryCompilationResponse,
  ChartRunPreviewResponse,
} from './canonical-chart.response';
import {
  CreateCanonicalChartDto,
  MoveCanonicalChartDto,
  PreviewChartDraftDto,
  PreviewChartQueryDto,
  CompileChartQueryDto,
  RestoreCanonicalChartRevisionDto,
  CreateChatCanonicalChartDto,
  UpdateChatCanonicalChartDto,
  RunCanonicalChartDto,
  UpdateCanonicalChartDto,
  RemoveCanonicalChartDto,
} from './canonical-chart.dto';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('canonical-charts')
@Controller('chart-authoring')
@RequireWorkspaceFeature('ANALYTICS')
@MachineAuthenticated()
@UseGuards(CanonicalChartAgentAuthGuard)
export class CanonicalChartController {
  public constructor(
    private readonly authoring: ChartAuthoringUseCases,
    private readonly runtime: ChartRuntimeUseCases,
    private readonly chatCreation: ChatChartCreationUseCases,
    @Inject(CHART_ACTIONS) private readonly actions: ChartActions,
    @Inject(ACTION_AUDIT_LOG) private readonly auditLog: IActionAuditLog,
    private readonly pendingActions: PendingActionUseCases,
  ) {}

  @Get('capabilities')
  @ApiOperation({ summary: 'List supported chart types, roles, and display settings' })
  public capabilities(): typeof CHART_CAPABILITIES {
    return CHART_CAPABILITIES;
  }

  @Post('previews')
  @ApiOperation({ summary: 'Execute an unsaved chart draft and return a transient preview' })
  @ApiOkResponse({ type: ChartRunPreviewResponse })
  public async preview(
    @Body() dto: PreviewChartDraftDto,
    @Req() request: Request,
  ): Promise<ChartRunPreviewResponse> {
    const actor = actorOf(request);
    const draft = draftOf(dto);
    const result = await this.runtime.previewChartDraft({
      actor,
      draft,
      parameterValues: dto.parameter_values,
    });
    let columns: readonly OutputColumn[] = [];
    let rowCount = 0;
    let byteCount = 0;
    let truncated = false;
    const mutableRows: (readonly unknown[])[] = [];
    for await (const event of result.stream) {
      if (event.type === 'COLUMNS') columns = event.columns;
      if (event.type === 'ROWS') mutableRows.push(...event.rows);
      if (event.type === 'SUCCEEDED') {
        rowCount = event.rowCount;
        byteCount = event.byteCount;
        truncated = event.truncated;
      }
      if (event.type === 'FAILED') {
        throw new BadRequestException({ code: event.code, message: event.message, details: null });
      }
      if (event.type === 'CANCELLED' || event.type === 'TIMED_OUT') {
        throw new BadRequestException({
          code: event.type,
          message: `Chart preview ${event.type.toLowerCase()}.`,
          details: null,
        });
      }
    }
    return new ChartRunPreviewResponse({
      runId: result.runId,
      columns,
      rows: mutableRows,
      rowCount,
      byteCount,
      truncated,
    });
  }

  @Post('query-previews')
  @ApiOperation({ summary: 'Execute a query draft before visualization bindings are selected' })
  @ApiOkResponse({ type: ChartRunPreviewResponse })
  public async previewQuery(
    @Body() dto: PreviewChartQueryDto,
    @Req() request: Request,
  ): Promise<ChartRunPreviewResponse> {
    const result = await this.runtime.previewQuery({
      actor: actorOf(request),
      queryDefinition: dto.query_definition as unknown as QueryDefinition,
      parameterValues: dto.parameter_values,
    });
    return collectRun(result.runId, result.stream);
  }

  @Post('query-compilations')
  @ApiOperation({ summary: 'Compile and authorize a chart query without executing it' })
  @ApiOkResponse({ type: ChartQueryCompilationResponse })
  public async compileQuery(
    @Body() dto: CompileChartQueryDto,
    @Req() request: Request,
  ): Promise<ChartQueryCompilationResponse> {
    const compiled = await this.runtime.compileQuery({
      actor: actorOf(request),
      queryDefinition: dto.query_definition as unknown as QueryDefinition,
      parameterValues: dto.parameter_values,
    });
    return new ChartQueryCompilationResponse({
      mode: (dto.query_definition as { mode: 'VISUAL' | 'NATIVE' }).mode,
      context: compiled.context,
      sql: compiled.sql,
    });
  }

  @Post('charts')
  @ApiOperation({ summary: 'Create a canonical chart from a complete draft' })
  @ApiOkResponse({ type: CanonicalChartResponse })
  public async create(
    @Body() dto: CreateCanonicalChartDto,
    @Req() request: Request,
  ): Promise<CanonicalChartResponse> {
    const actor = actorOf(request);
    const saved = await this.authoring.createChart({
      actor,
      draft: draftOf(dto),
    });
    return CanonicalChartResponse.from(saved.chart, saved.revision);
  }

  @Put('charts/:chartId')
  @ApiOperation({ summary: 'Update a canonical chart with a complete draft' })
  @ApiOkResponse({ type: CanonicalChartResponse })
  public async update(
    @Param('chartId') chartId: string,
    @Body() dto: UpdateCanonicalChartDto,
    @Req() request: Request,
  ): Promise<CanonicalChartResponse> {
    const saved = await this.authoring.updateChartFromDraft({
      actor: actorOf(request),
      chartId,
      expectedRevision: dto.expected_revision,
      draft: draftOf(dto),
    });
    return CanonicalChartResponse.from(saved.chart, saved.revision);
  }

  @Get('charts/:chartId')
  @ApiOperation({ summary: 'Get a canonical chart and its current definition' })
  @ApiOkResponse({ type: CanonicalChartResponse })
  public async get(
    @Param('chartId') chartId: string,
    @Req() request: Request,
  ): Promise<CanonicalChartResponse> {
    const actor = actorOf(request);
    const found = await this.authoring.getChart(actor.organizationId, chartId, actor);
    return CanonicalChartResponse.from(found.chart, found.revision);
  }

  @Get('charts/:chartId/revisions')
  @ApiOperation({ summary: 'List canonical chart revisions' })
  @ApiOkResponse({ type: CanonicalChartRevisionResponse, isArray: true })
  public async revisions(
    @Param('chartId') chartId: string,
    @Req() request: Request,
  ): Promise<readonly CanonicalChartRevisionResponse[]> {
    const actor = actorOf(request);
    const revisions = await this.authoring.listRevisions(actor.organizationId, chartId, actor);
    return revisions.map((revision) => CanonicalChartRevisionResponse.from(revision));
  }

  @Get('charts')
  @ApiOperation({ summary: 'List canonical charts in the current organization' })
  @ApiOkResponse({ type: CanonicalChartSummaryResponse, isArray: true })
  public async list(
    @Query('collection_id') collectionId: string | undefined,
    @Req() request: Request,
  ): Promise<readonly CanonicalChartSummaryResponse[]> {
    const charts = await this.authoring.listCharts({
      organizationId: actorOf(request).organizationId,
      actor: actorOf(request),
      collectionId,
    });
    return charts.map((chart) => CanonicalChartSummaryResponse.from(chart));
  }

  @Post('charts/:chartId/moves')
  @ApiOperation({ summary: 'Move a canonical chart to another collection' })
  public async move(
    @Param('chartId') chartId: string,
    @Body() dto: MoveCanonicalChartDto,
    @Req() request: Request,
  ): Promise<CanonicalChartSummaryResponse> {
    const chart = await this.authoring.moveChart({
      actor: actorOf(request),
      chartId,
      collectionId: dto.collection_id,
    });
    return CanonicalChartSummaryResponse.from(chart);
  }

  @Post('charts/:chartId/archive')
  @ApiOperation({ summary: 'Archive a canonical chart' })
  public async archive(
    @Param('chartId') chartId: string,
    @Body() dto: RemoveCanonicalChartDto | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<
    CanonicalChartSummaryResponse | { status: 'pending_approval'; pending_action_id: string }
  > {
    return this.runRemoveAction(chartId, dto?.rationale, request, response);
  }

  @Delete('charts/:chartId')
  @ApiOperation({ summary: 'Archive a canonical chart (canonical delete is soft)' })
  public async remove(
    @Param('chartId') chartId: string,
    @Req() request: Request,
    @Query('rationale') rationale: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<
    CanonicalChartSummaryResponse | { status: 'pending_approval'; pending_action_id: string }
  > {
    return this.runRemoveAction(chartId, rationale, request, response);
  }

  private async runRemoveAction(
    chartId: string,
    rationale: string | undefined,
    request: Request,
    response: Response,
  ): Promise<
    CanonicalChartSummaryResponse | { status: 'pending_approval'; pending_action_id: string }
  > {
    const action = this.actions.canonicalRemove;
    if (!action) {
      throw new BadRequestException({
        code: 'CHART_REMOVE_UNAVAILABLE',
        message: 'Canonical chart removal is unavailable.',
        details: null,
      });
    }
    const actor = actorOf(request);
    const result = await runAction<CanonicalRemoveInput, Chart>(
      action,
      { organizationId: actor.organizationId, chartId },
      actionActorOf(request, actor),
      this.auditLog,
      this.pendingActions,
      rationale,
      approvalOverrideFor(request, action.name),
    );
    if (result.kind === 'pending_approval') {
      response.status(HttpStatus.ACCEPTED);
      return { status: 'pending_approval', pending_action_id: result.pendingActionId };
    }
    return CanonicalChartSummaryResponse.from(result.value);
  }

  @Post('charts/:chartId/copies')
  @ApiOperation({ summary: 'Save a complete chart draft as a new canonical chart' })
  @ApiOkResponse({ type: CanonicalChartResponse })
  public async copy(
    @Body() dto: CreateCanonicalChartDto,
    @Req() request: Request,
  ): Promise<CanonicalChartResponse> {
    const saved = await this.authoring.saveChartAsNew({
      actor: actorOf(request),
      draft: draftOf(dto),
    });
    return CanonicalChartResponse.from(saved.chart, saved.revision);
  }

  @Post('charts/:chartId/revisions/:revisionNumber/restore')
  @ApiOperation({ summary: 'Restore a previous revision as a new current revision' })
  @ApiOkResponse({ type: CanonicalChartResponse })
  public async restore(
    @Param('chartId') chartId: string,
    @Param('revisionNumber') revisionNumber: string,
    @Body() dto: RestoreCanonicalChartRevisionDto,
    @Req() request: Request,
  ): Promise<CanonicalChartResponse> {
    const restored = await this.authoring.restoreChartRevision({
      actor: actorOf(request),
      chartId,
      revisionNumber: parseInt(revisionNumber, 10),
      expectedRevision: dto.expected_revision,
    });
    return CanonicalChartResponse.from(restored.chart, restored.revision);
  }

  @Post('chat-charts')
  @ApiOperation({
    summary: 'Rerun and save a confirmed Chat-to-Chart preview in the selected collection',
  })
  @ApiOkResponse({ type: CanonicalChartResponse })
  public async createChat(
    @Body() dto: CreateChatCanonicalChartDto,
    @Req() request: Request,
  ): Promise<CanonicalChartResponse> {
    const saved = await this.chatCreation.create({
      actor: actorOf(request),
      collectionId: dto.collection_id,
      title: dto.title,
      description: dto.description,
      queryDefinition: dto.query_definition as unknown as QueryDefinition,
      visualizationDefinition: dto.visualization_definition as unknown as VisualizationDefinition,
      parameterValues: dto.parameter_values,
    });
    return CanonicalChartResponse.from(saved.chart, saved.revision);
  }

  @Post('chat-charts/:chartId')
  @ApiOperation({ summary: 'Run and update a Chat-to-Chart canonical chart revision' })
  @ApiOkResponse({ type: CanonicalChartResponse })
  public async updateChat(
    @Param('chartId') chartId: string,
    @Body() dto: UpdateChatCanonicalChartDto,
    @Req() request: Request,
  ): Promise<CanonicalChartResponse> {
    const saved = await this.chatCreation.update({
      actor: actorOf(request),
      chartId,
      expectedRevision: dto.expected_revision,
      title: dto.title,
      description: dto.description,
      queryDefinition: dto.query_definition as unknown as QueryDefinition,
      visualizationDefinition: dto.visualization_definition as unknown as VisualizationDefinition,
      parameterValues: dto.parameter_values,
    });
    return CanonicalChartResponse.from(saved.chart, saved.revision);
  }

  @Post('charts/:chartId/runs')
  @ApiOperation({ summary: 'Run a saved canonical chart' })
  public async run(
    @Param('chartId') chartId: string,
    @Body() dto: RunCanonicalChartDto,
    @Req() request: Request,
  ): Promise<ChartRunPreviewResponse> {
    const result = await this.runtime.runSavedChart(
      actorOf(request),
      chartId,
      dto.parameter_values,
    );
    return collectRun(result.runId, result.stream);
  }

  @Post('charts/:chartId/runs/:runId/cancel')
  @ApiOperation({ summary: 'Cancel an active canonical chart run' })
  public cancel(@Param('runId') runId: string): { cancelled: boolean } {
    return { cancelled: this.runtime.cancelChartRun(runId) };
  }
}

function actorOf(request: Request): ChartActor {
  const principal = requireAuthenticatedPrincipal(request);
  return {
    organizationId: principal.organizationId,
    identityId: principal.identityId,
    isOrganizationAdmin: ['PLATFORM_ADMIN', 'ORG_OWNER', 'ORG_ADMIN'].includes(principal.role),
  };
}

function actionActorOf(request: Request, actor: ChartActor): ActionActor {
  return {
    source: 'agent',
    runId: request.get('X-Minder-Run-Id') ?? null,
    identityId: actor.identityId,
  };
}

function draftOf(
  dto: PreviewChartDraftDto | CreateCanonicalChartDto | UpdateCanonicalChartDto,
): ChartDraft {
  return {
    title: dto.title,
    description: dto.description,
    collectionId: dto.collection_id,
    queryDefinition: dto.query_definition as unknown as QueryDefinition,
    visualizationDefinition: dto.visualization_definition as unknown as VisualizationDefinition,
    outputSchema: dto.output_schema as unknown as readonly OutputColumn[],
    parameterValues: dto.parameter_values,
  };
}

async function collectRun(
  runId: string,
  stream: AsyncIterable<ChartRunEvent>,
): Promise<ChartRunPreviewResponse> {
  const rows: (readonly unknown[])[] = [];
  let columns: readonly OutputColumn[] = [];
  let rowCount = 0;
  let byteCount = 0;
  let truncated = false;
  for await (const event of stream) {
    if (event.type === 'COLUMNS') columns = event.columns;
    if (event.type === 'ROWS') rows.push(...event.rows);
    if (event.type === 'SUCCEEDED') ({ rowCount, byteCount, truncated } = event);
    if (event.type === 'FAILED')
      throw new BadRequestException({ code: event.code, message: event.message, details: null });
    if (event.type === 'CANCELLED' || event.type === 'TIMED_OUT')
      throw new BadRequestException({ code: event.type, message: event.type, details: null });
  }
  return new ChartRunPreviewResponse({ runId, columns, rows, rowCount, byteCount, truncated });
}

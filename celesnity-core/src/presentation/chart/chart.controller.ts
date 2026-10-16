import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type MessageEvent,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

import type { ActionActor } from '@application/actions/action.types';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import { ACTION_AUDIT_LOG } from '@application/actions/tokens';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import type { ChartActions } from '@application/chart/chart.actions';
import { CHART_ACTIONS } from '@application/chart/chart.actions';
import { ChartUseCases } from '@application/chart/chart.use-cases';
import { parseCsvToChartRows } from '@application/chart/csv-ingestion';
import type { IChartRealtimeHub } from '@application/chart/interfaces/i-chart-realtime-hub';
import { CHART_REALTIME_HUB } from '@application/chart/tokens';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { ChartAgentAuthGuard } from '@presentation/http/chart-agent-auth.guard';
import { type ChartMutationRequest } from '@presentation/http/chart-mutation.guard';
import { RUN_ID_HEADER } from '@presentation/http/run-id-header';
import { runAction, unwrapCompleted, type RunActionResult } from '@presentation/http/run-action';
import { approvalOverrideFor } from '@presentation/http/action-approval-override';
import { createChartStream } from './chart-stream';
import {
  CreateChartDto,
  PatchChartDto,
  SetChartDataDto,
  SetChartEncodingsDto,
  SetChartSpecDto,
} from './chart.dto';
import { ChartResponse } from './chart.response';

/**
 * The fields this controller reads off whatever `multer` (via
 * `FileInterceptor`) attaches to the request — same rationale as
 * `DocumentController`'s identical interface: this project's `tsconfig.json`
 * restricts automatic global type inclusion to `["node", "jest"]`, so
 * `@types/multer`'s ambient namespace merge isn't picked up.
 */
interface UploadedCsvFile {
  readonly buffer: Buffer;
}

@ApiTags('charts')
@Controller('charts')
@RequireWorkspaceFeature('ANALYTICS')
export class ChartController {
  public constructor(
    @Inject(CHART_ACTIONS) private readonly actions: ChartActions,
    @Inject(ACTION_AUDIT_LOG) private readonly auditLog: IActionAuditLog,
    @Inject(CHART_REALTIME_HUB) private readonly realtime: IChartRealtimeHub,
    private readonly useCases: ChartUseCases,
    private readonly pendingActions: PendingActionUseCases,
  ) {}

  @Post()
  @MachineAuthenticated()
  @UseGuards(ChartAgentAuthGuard)
  @ApiOperation({ summary: 'Create a new chart' })
  @ApiOkResponse({ type: ChartResponse })
  public async create(
    @Body() dto: CreateChartDto,
    @Req() req: ChartMutationRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChartResponse | PendingApprovalResponse> {
    const result = await runAction(
      this.actions.create,
      {
        runId: dto.run_id,
        title: dto.title,
        chartType: dto.chart_type,
        encodings: dto.encodings,
        data: dto.data,
        config: dto.config,
        sql: dto.sql,
      },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.create.name),
    );
    return respondToMutation(result, res, (chart) => ChartResponse.from(chart));
  }

  @Get()
  @ApiOperation({ summary: 'List charts' })
  @ApiOkResponse({ type: ChartResponse, isArray: true })
  public async list(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<readonly ChartResponse[]> {
    const result = await runAction(
      this.actions.list,
      { cursor, limit: limit ? parseInt(limit, 10) : undefined },
      anonymousActorOf(req),
      this.auditLog,
      this.pendingActions,
    );
    return ChartResponse.fromList(unwrapCompleted(result));
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Stream chart updates as they change' })
  @ApiProduces('text/event-stream')
  public streamCharts(@Headers('last-event-id') lastEventId?: string): Observable<MessageEvent> {
    return createChartStream(this.useCases, this.realtime, lastEventId);
  }

  @Get(':chartId')
  @ApiOperation({ summary: 'Get a single chart by ID' })
  @ApiOkResponse({ type: ChartResponse })
  public async findById(
    @Param('chartId') chartId: string,
    @Req() req: Request,
  ): Promise<ChartResponse> {
    const result = await runAction(
      this.actions.findById,
      { chartId },
      anonymousActorOf(req),
      this.auditLog,
      this.pendingActions,
    );
    return ChartResponse.from(unwrapCompleted(result));
  }

  @Put(':chartId/data')
  @MachineAuthenticated()
  @UseGuards(ChartAgentAuthGuard)
  @ApiOperation({ summary: 'Set chart data (reassembles Vega-Lite spec)' })
  @ApiOkResponse({ type: ChartResponse })
  public async setData(
    @Param('chartId') chartId: string,
    @Body() dto: SetChartDataDto,
    @Req() req: ChartMutationRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChartResponse | PendingApprovalResponse> {
    const result = await runAction(
      this.actions.setData,
      { chartId, data: dto.data, expectedVersion: dto.expected_version, sql: dto.sql },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.setData.name),
    );
    return respondToMutation(result, res, (chart) => ChartResponse.from(chart));
  }

  /**
   * Turns an uploaded CSV into chart data in one step (AIP Analyst's
   * spreadsheet-ingestion pattern) — the header row becomes column names,
   * every other row becomes one data record, and numeric-looking cells are
   * coerced to numbers. Otherwise identical to `PUT :chartId/data`: same
   * guard, same optimistic-concurrency check, same Vega-Lite reassembly.
   */
  @Post(':chartId/data/csv')
  @MachineAuthenticated()
  @UseGuards(ChartAgentAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Set chart data from an uploaded CSV file' })
  @ApiOkResponse({ type: ChartResponse })
  public async setDataFromCsv(
    @Param('chartId') chartId: string,
    @Req() req: ChartMutationRequest,
    @Res({ passthrough: true }) res: Response,
    @Query('expected_version') expectedVersion?: string,
    @UploadedFile() file?: UploadedCsvFile,
  ): Promise<ChartResponse | PendingApprovalResponse> {
    if (!file) {
      throw new BadRequestException({
        code: 'MISSING_FILE',
        message: 'A file is required (multipart field "file").',
        details: null,
      });
    }
    const data = parseCsvToChartRows(file.buffer);
    const result = await runAction(
      this.actions.setData,
      {
        chartId,
        data,
        expectedVersion: expectedVersion === undefined ? undefined : parseInt(expectedVersion, 10),
        sql: null,
      },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.setData.name),
    );
    return respondToMutation(result, res, (chart) => ChartResponse.from(chart));
  }

  @Put(':chartId/encodings')
  @MachineAuthenticated()
  @UseGuards(ChartAgentAuthGuard)
  @ApiOperation({ summary: 'Set chart encodings (reassembles Vega-Lite spec)' })
  @ApiOkResponse({ type: ChartResponse })
  public async setEncodings(
    @Param('chartId') chartId: string,
    @Body() dto: SetChartEncodingsDto,
    @Req() req: ChartMutationRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChartResponse | PendingApprovalResponse> {
    const result = await runAction(
      this.actions.setEncodings,
      { chartId, encodings: dto.encodings, expectedVersion: dto.expected_version },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.setEncodings.name),
    );
    return respondToMutation(result, res, (chart) => ChartResponse.from(chart));
  }

  @Patch(':chartId/spec')
  @MachineAuthenticated()
  @UseGuards(ChartAgentAuthGuard)
  @ApiOperation({ summary: 'Directly set a Vega-Lite spec (bypasses assembly)' })
  @ApiOkResponse({ type: ChartResponse })
  public async setSpec(
    @Param('chartId') chartId: string,
    @Body() dto: SetChartSpecDto,
    @Req() req: ChartMutationRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChartResponse | PendingApprovalResponse> {
    const result = await runAction(
      this.actions.setSpec,
      { chartId, vlSpec: dto.vl_spec, expectedVersion: dto.expected_version },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.setSpec.name),
    );
    return respondToMutation(result, res, (chart) => ChartResponse.from(chart));
  }

  @Patch(':chartId')
  @MachineAuthenticated()
  @UseGuards(ChartAgentAuthGuard)
  @ApiOperation({ summary: 'Patch chart metadata, encodings, config, or spec' })
  @ApiOkResponse({ type: ChartResponse })
  public async patch(
    @Param('chartId') chartId: string,
    @Body() dto: PatchChartDto,
    @Req() req: ChartMutationRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChartResponse | PendingApprovalResponse> {
    const result = await runAction(
      this.actions.patch,
      {
        chartId,
        title: dto.title,
        chartType: dto.chart_type,
        encodings: dto.encodings,
        data: dto.data,
        config: dto.config,
        vlSpec: dto.vl_spec,
        expectedVersion: dto.expected_version,
        sql: dto.sql,
      },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.patch.name),
    );
    return respondToMutation(result, res, (chart) => ChartResponse.from(chart));
  }

  /**
   * Deletion is `approvalRequired` (see `chart.actions.ts`) — charts are
   * global, so deleting one is the one destructive action here. This
   * returns 202 with a pending-action id instead of deleting immediately;
   * a human confirms via `POST /pending-actions/:id/approve`.
   */
  @Delete(':chartId')
  @MachineAuthenticated()
  @UseGuards(ChartAgentAuthGuard)
  @ApiOperation({ summary: 'Propose deleting a chart (requires approval)' })
  public async delete(
    @Param('chartId') chartId: string,
    @Req() req: ChartMutationRequest,
    @Res({ passthrough: true }) res: Response,
    @Query('expected_version') expectedVersion?: string,
    @Query('rationale') rationale?: string,
  ): Promise<{ status: 'pending_approval'; pending_action_id: string } | undefined> {
    const result = await runAction(
      this.actions.delete,
      {
        chartId,
        expectedVersion: expectedVersion === undefined ? undefined : parseInt(expectedVersion, 10),
      },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      rationale,
      approvalOverrideFor(req, this.actions.delete.name),
    );
    if (result.kind === 'pending_approval') {
      res.status(HttpStatus.ACCEPTED);
      return { status: 'pending_approval', pending_action_id: result.pendingActionId };
    }
    res.status(HttpStatus.NO_CONTENT);
    return undefined;
  }
}

function actorOf(req: ChartMutationRequest): ActionActor {
  return req.chartActor ?? { source: 'anonymous', runId: null, identityId: null };
}

function anonymousActorOf(req: Request): ActionActor {
  return { source: 'anonymous', runId: req.get(RUN_ID_HEADER) ?? null, identityId: null };
}

type PendingApprovalResponse = { status: 'pending_approval'; pending_action_id: string };

/**
 * Shared response shaping for mutation endpoints that may now resolve to
 * `pending_approval` (via an agent manifest's `action_approvals` override —
 * see `action-approval-override.ts`) even though their action's own default
 * is immediate. Mirrors `delete`'s existing pending-approval contract: 202
 * with the pending action id instead of the normal 200 body.
 */
function respondToMutation<TOutput>(
  result: RunActionResult<TOutput>,
  res: Response,
  toResponse: (value: TOutput) => ChartResponse,
): ChartResponse | PendingApprovalResponse {
  if (result.kind === 'pending_approval') {
    res.status(HttpStatus.ACCEPTED);
    return { status: 'pending_approval', pending_action_id: result.pendingActionId };
  }
  return toResponse(result.value);
}

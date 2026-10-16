import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { CreateWorkflowUseCase } from '@application/data-workflow/create-workflow.use-case';
import {
  GetWorkflowUseCase,
  ListWorkflowVersionsUseCase,
  ListWorkflowsUseCase,
} from '@application/data-workflow/read-workflow.use-cases';
import { PublishWorkflowUseCase } from '@application/data-workflow/publish-workflow.use-case';
import { SetWorkflowPausedUseCase } from '@application/data-workflow/set-workflow-paused.use-case';
import { PreviewWorkflowCalendarUseCase } from '@application/data-workflow/preview-workflow-calendar.use-case';
import { GetWorkflowScheduleUseCase } from '@application/data-workflow/read-workflow-schedule.use-case';
import { UpdateWorkflowUseCase } from '@application/data-workflow/update-workflow.use-case';
import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import { tryAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  CreateDataWorkflowDto,
  DataWorkflowHistoryQueryDto,
  DataWorkflowListQueryDto,
  PublishDataWorkflowDto,
  PreviewDataWorkflowScheduleDto,
  SetDataWorkflowStateDto,
  UpdateDataWorkflowDto,
} from '@presentation/data-workflow/data-workflow.dto';
import {
  DataWorkflowPageResponseDto,
  DataWorkflowCalendarPreviewResponseDto,
  DataWorkflowResponseDto,
  DataWorkflowScheduleStateResponseDto,
  DataWorkflowVersionResponseDto,
} from '@presentation/data-workflow/data-workflow.response';

@ApiTags('data-workflows')
@Controller('data-workflows')
@RequireWorkspaceFeature('PIPELINES')
export class DataWorkflowController {
  public constructor(
    private readonly createWorkflow: CreateWorkflowUseCase,
    private readonly updateWorkflow: UpdateWorkflowUseCase,
    private readonly publishWorkflow: PublishWorkflowUseCase,
    private readonly setPaused: SetWorkflowPausedUseCase,
    private readonly listWorkflows: ListWorkflowsUseCase,
    private readonly getWorkflow: GetWorkflowUseCase,
    private readonly getSchedule: GetWorkflowScheduleUseCase,
    private readonly previewCalendar: PreviewWorkflowCalendarUseCase,
    private readonly listVersions: ListWorkflowVersionsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft data workflow' })
  @ApiCreatedResponse({ type: DataWorkflowResponseDto })
  public async create(
    @Req() request: Request,
    @Body() body: CreateDataWorkflowDto,
  ): Promise<DataWorkflowResponseDto> {
    const workflow = await this.createWorkflow.execute(actorOf(request), {
      name: body.draft.name,
      graph: body.draft.graph,
      paused: body.paused,
    });
    return DataWorkflowResponseDto.from(workflow);
  }

  @Get()
  @ApiOperation({ summary: 'List data workflows in the current workspace' })
  @ApiOkResponse({ type: DataWorkflowPageResponseDto })
  public async list(
    @Req() request: Request,
    @Query() query: DataWorkflowListQueryDto,
  ): Promise<DataWorkflowPageResponseDto> {
    const page = await this.listWorkflows.execute(actorOf(request), query.page, query.pageSize);
    return Object.assign(new DataWorkflowPageResponseDto(), {
      data: page.items.map((workflow) => DataWorkflowResponseDto.from(workflow)),
      page: page.page,
      pageSize: page.pageSize,
      totalItems: page.totalItems,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a data workflow draft and published-version pointer' })
  @ApiOkResponse({ type: DataWorkflowResponseDto })
  public async get(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe()) workflowId: string,
  ): Promise<DataWorkflowResponseDto> {
    const actor = actorOf(request);
    const workflow = await this.getWorkflow.execute(actor, workflowId);
    const schedule = await this.getSchedule.execute(actor, workflowId);
    return DataWorkflowResponseDto.from(
      workflow,
      DataWorkflowScheduleStateResponseDto.from(schedule),
    );
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get safe automatic schedule state for a data workflow' })
  @ApiOkResponse({ type: DataWorkflowScheduleStateResponseDto })
  public async schedule(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe()) workflowId: string,
  ): Promise<DataWorkflowScheduleStateResponseDto> {
    return DataWorkflowScheduleStateResponseDto.from(
      await this.getSchedule.execute(actorOf(request), workflowId),
    );
  }

  @Post(':id/schedule/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview up to 20 calendar occurrences from a workflow draft or publication',
  })
  @ApiOkResponse({ type: DataWorkflowCalendarPreviewResponseDto })
  public async previewSchedule(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe()) workflowId: string,
    @Body() body: PreviewDataWorkflowScheduleDto,
  ): Promise<DataWorkflowCalendarPreviewResponseDto> {
    return DataWorkflowCalendarPreviewResponseDto.from(
      await this.previewCalendar.execute(actorOf(request), workflowId, body),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a data workflow draft using its expected revision' })
  @ApiOkResponse({ type: DataWorkflowResponseDto })
  public async update(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe()) workflowId: string,
    @Body() body: UpdateDataWorkflowDto,
  ): Promise<DataWorkflowResponseDto> {
    const workflow = await this.updateWorkflow.execute(actorOf(request), workflowId, {
      revision: body.expectedRevision,
      name: body.draft.name,
      graph: body.draft.graph,
    });
    return DataWorkflowResponseDto.from(workflow);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish an immutable data workflow version' })
  @ApiOkResponse({ type: DataWorkflowVersionResponseDto })
  public async publish(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe()) workflowId: string,
    @Body() body: PublishDataWorkflowDto,
  ): Promise<DataWorkflowVersionResponseDto> {
    return DataWorkflowVersionResponseDto.from(
      await this.publishWorkflow.execute(actorOf(request), workflowId, body.expectedRevision),
    );
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List immutable published workflow versions' })
  @ApiOkResponse({ type: DataWorkflowVersionResponseDto, isArray: true })
  public async versions(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe()) workflowId: string,
    @Query() query: DataWorkflowHistoryQueryDto,
  ): Promise<readonly DataWorkflowVersionResponseDto[]> {
    const versions = await this.listVersions.execute(actorOf(request), workflowId, query.limit);
    return versions.map((version) => DataWorkflowVersionResponseDto.from(version));
  }

  @Patch(':id/state')
  @ApiOperation({ summary: 'Pause or resume a data workflow using its expected revision' })
  @ApiOkResponse({ type: DataWorkflowResponseDto })
  public async setState(
    @Req() request: Request,
    @Param('id', new ParseUUIDPipe()) workflowId: string,
    @Body() body: SetDataWorkflowStateDto,
  ): Promise<DataWorkflowResponseDto> {
    const actor = actorOf(request);
    const workflow = await this.setPaused.execute(
      actor,
      workflowId,
      body.expectedRevision,
      body.paused,
    );
    const schedule = await this.getSchedule.execute(actor, workflowId);
    return DataWorkflowResponseDto.from(
      workflow,
      DataWorkflowScheduleStateResponseDto.from(schedule),
    );
  }
}

function actorOf(request: Request): WorkflowActor {
  const principal = tryAuthenticatedPrincipal(request);
  if (principal === undefined) {
    throw new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'An authenticated organization context is required.',
      details: null,
    });
  }
  return { organizationId: principal.organizationId, identityId: principal.identityId };
}

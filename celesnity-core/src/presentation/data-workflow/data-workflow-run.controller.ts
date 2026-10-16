import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { RetryWorkflowNodeUseCase } from '@application/data-workflow/retry-workflow-node.use-case';
import { StartWorkflowRunUseCase } from '@application/data-workflow/start-workflow-run.use-case';
import {
  GetWorkflowRunUseCase,
  ListWorkflowRunsUseCase,
} from '@application/data-workflow/read-workflow-run.use-cases';
import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import { tryAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  DataWorkflowHistoryQueryDto,
  RetryDataWorkflowNodeDto,
  StartDataWorkflowRunDto,
} from '@presentation/data-workflow/data-workflow.dto';
import {
  DataWorkflowRunResponseDto,
  StartedDataWorkflowRunResponseDto,
} from '@presentation/data-workflow/data-workflow.response';

@ApiTags('data-workflows')
@Controller('data-workflows/:workflowId/runs')
@RequireWorkspaceFeature('PIPELINES')
export class DataWorkflowRunController {
  public constructor(
    private readonly startRun: StartWorkflowRunUseCase,
    private readonly retryNode: RetryWorkflowNodeUseCase,
    private readonly listRuns: ListWorkflowRunsUseCase,
    private readonly getRun: GetWorkflowRunUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start a published data workflow run' })
  @ApiCreatedResponse({ type: StartedDataWorkflowRunResponseDto })
  public start(
    @Req() request: Request,
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
    @Body() body: StartDataWorkflowRunDto,
  ): Promise<StartedDataWorkflowRunResponseDto> {
    return this.startRun.execute({
      actor: actorOf(request),
      workflowId,
      parameters: body.parameters,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List data workflow runs without parameter or delegation values' })
  @ApiOkResponse({ type: DataWorkflowRunResponseDto, isArray: true })
  public async list(
    @Req() request: Request,
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
    @Query() query: DataWorkflowHistoryQueryDto,
  ): Promise<readonly DataWorkflowRunResponseDto[]> {
    const page = await this.listRuns.execute(actorOf(request), workflowId, query.limit);
    return page.items.map((run) => DataWorkflowRunResponseDto.from(run));
  }

  @Get(':runId')
  @ApiOperation({ summary: 'Get one data workflow run status' })
  @ApiOkResponse({ type: DataWorkflowRunResponseDto })
  public async get(
    @Req() request: Request,
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ): Promise<DataWorkflowRunResponseDto> {
    return DataWorkflowRunResponseDto.from(
      await this.getRun.execute(actorOf(request), workflowId, runId),
    );
  }

  @Post(':runId/retries')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retry a failed pipeline node after acknowledging duplicate-write risk',
  })
  @ApiNoContentResponse()
  public async retry(
    @Req() request: Request,
    @Param('workflowId', new ParseUUIDPipe()) workflowId: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Body() body: RetryDataWorkflowNodeDto,
  ): Promise<void> {
    const actor = actorOf(request);
    // Read first to ensure this URL cannot cause a retry across workflow scope.
    await this.getRun.execute(actor, workflowId, runId);
    await this.retryNode.execute({
      actor,
      runId,
      nodeId: body.nodeId,
      expectedRevision: body.expectedRevision,
      acknowledgeWriteRisk: body.acknowledgeWriteRisk,
    });
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

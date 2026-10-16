import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { ListWorkflowPipelineTargetsUseCase } from '@application/data-workflow/list-workflow-pipeline-targets.use-case';
import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import { tryAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { WorkflowPipelineTargetResponseDto } from '@presentation/data-workflow/workflow-pipeline-targets.response';

@ApiTags('data-workflows')
@Controller('data-workflows/pipelines')
@RequireWorkspaceFeature('PIPELINES')
export class WorkflowPipelineTargetsController {
  public constructor(private readonly listTargets: ListWorkflowPipelineTargetsUseCase) {}

  @Get(':pipelineId/versions/:versionNumber/targets')
  @ApiOperation({ summary: 'List target schemas from a pinned pipeline version' })
  @ApiOkResponse({ type: WorkflowPipelineTargetResponseDto, isArray: true })
  public async list(
    @Req() request: Request,
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
    @Param('versionNumber', new ParseIntPipe()) versionNumber: number,
  ): Promise<readonly WorkflowPipelineTargetResponseDto[]> {
    const targets = await this.listTargets.execute(actorOf(request), {
      pipelineId,
      versionNumber,
    });
    return targets.map((target) => WorkflowPipelineTargetResponseDto.from(target));
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

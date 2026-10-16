import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ExecutionOrchestrationUseCases } from '@application/execution-orchestration/execution-orchestration.use-cases';
import { ExecutionAcceptedResponseDto } from '@presentation/execution-orchestration/execution.response';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('executions')
@Controller('pipelines')
@RequireWorkspaceFeature('PIPELINES')
export class PipelineExecutionController {
  public constructor(private readonly useCases: ExecutionOrchestrationUseCases) {}

  @Post(':pipelineId/versions/:version/executions')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a Spark execution for a compiled pipeline version' })
  @ApiAcceptedResponse({ type: ExecutionAcceptedResponseDto })
  public async start(
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ExecutionAcceptedResponseDto> {
    return ExecutionAcceptedResponseDto.from(
      await this.useCases.requestPipeline({ pipelineId, versionNumber: version }),
    );
  }
}

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
@Controller('scripts')
@RequireWorkspaceFeature('EXECUTIONS')
export class ScriptExecutionController {
  public constructor(private readonly useCases: ExecutionOrchestrationUseCases) {}

  @Post(':scriptId/versions/:version/executions')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a Spark execution for a published script version' })
  @ApiAcceptedResponse({ type: ExecutionAcceptedResponseDto })
  public async start(
    @Param('scriptId', new ParseUUIDPipe()) scriptId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ExecutionAcceptedResponseDto> {
    const result = await this.useCases.request({ scriptId, versionNumber: version });
    return ExecutionAcceptedResponseDto.from(result);
  }
}

import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PipelineCompilationService } from '@application/pipeline-compilation/pipeline-compilation.service';
import { PipelineCompilationResponseDto } from '@presentation/pipeline-compilation/pipeline-compilation.response';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('pipelines')
@Controller('pipelines')
@RequireWorkspaceFeature('PIPELINES')
export class PipelineCompilationController {
  public constructor(private readonly compilation: PipelineCompilationService) {}

  @Post(':pipelineId/versions/:version/compile')
  @ApiOperation({ summary: 'Compile and publish an immutable pipeline version' })
  @ApiOkResponse({ type: PipelineCompilationResponseDto })
  public async compile(
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<PipelineCompilationResponseDto> {
    return PipelineCompilationResponseDto.from(await this.compilation.compile(pipelineId, version));
  }

  @Get(':pipelineId/versions/:version/generated-script')
  @ApiOperation({ summary: 'Read the integrity-verified generated PySpark source' })
  @ApiOkResponse({ type: PipelineCompilationResponseDto })
  public async generatedScript(
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<PipelineCompilationResponseDto> {
    return PipelineCompilationResponseDto.from(
      await this.compilation.generatedSource(pipelineId, version),
    );
  }
}

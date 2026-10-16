import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { PipelineAuthoringUseCases } from '@application/pipeline-authoring/pipeline-authoring.use-cases';
import {
  ClonePipelineDto,
  ListPipelinesQueryDto,
  PreviewPipelineNodeDto,
  SavePipelineDto,
  UpdatePipelineDto,
  ValidateEdgeDto,
  ValidatePipelineDto,
} from '@presentation/pipeline-authoring/pipeline.dto';
import {
  PipelineCollectionResponseDto,
  PipelinePreviewResponseDto,
  PipelineValidationResponseDto,
  SinglePipelineResponseDto,
} from '@presentation/pipeline-authoring/pipeline.response';
import type { ResponseMetaValue } from '@presentation/node-catalog/node-catalog.response';

@ApiTags('pipelines')
@Controller('pipelines')
@RequireWorkspaceFeature('PIPELINES')
export class PipelineController {
  public constructor(private readonly useCases: PipelineAuthoringUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List visual ETL pipelines' })
  @ApiOkResponse({ type: PipelineCollectionResponseDto })
  public async list(
    @Query() query: ListPipelinesQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PipelineCollectionResponseDto> {
    return PipelineCollectionResponseDto.from(
      await this.useCases.list(query),
      responseMeta(response),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft visual ETL pipeline' })
  @ApiCreatedResponse({ type: SinglePipelineResponseDto })
  public async create(
    @Body() input: SavePipelineDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SinglePipelineResponseDto> {
    return SinglePipelineResponseDto.from(
      await this.useCases.create(input),
      responseMeta(response),
    );
  }

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate an unsaved pipeline graph' })
  @ApiOkResponse({ type: PipelineValidationResponseDto })
  public async validate(
    @Body() input: ValidatePipelineDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PipelineValidationResponseDto> {
    return PipelineValidationResponseDto.from(
      await this.useCases.validateGraph(input.graph),
      responseMeta(response),
    );
  }

  @Post('validate-edge')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate a proposed graph edge' })
  @ApiOkResponse({ type: PipelineValidationResponseDto })
  public async validateEdge(
    @Body() input: ValidateEdgeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PipelineValidationResponseDto> {
    return PipelineValidationResponseDto.from(
      await this.useCases.validateEdge(input.graph, input.edge),
      responseMeta(response),
    );
  }

  @Get(':pipelineId')
  @ApiOperation({ summary: 'Get a pipeline and its graph' })
  @ApiOkResponse({ type: SinglePipelineResponseDto })
  public async get(
    @Param('pipelineId', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SinglePipelineResponseDto> {
    return SinglePipelineResponseDto.from(await this.useCases.get(id), responseMeta(response));
  }

  @Put(':pipelineId')
  @ApiOperation({ summary: 'Save a pipeline using optimistic versioning' })
  @ApiOkResponse({ type: SinglePipelineResponseDto })
  public async update(
    @Param('pipelineId', new ParseUUIDPipe()) id: string,
    @Body() input: UpdatePipelineDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SinglePipelineResponseDto> {
    return SinglePipelineResponseDto.from(
      await this.useCases.update(id, input),
      responseMeta(response),
    );
  }

  @Delete(':pipelineId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archive a pipeline' })
  @ApiNoContentResponse()
  public archive(@Param('pipelineId', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.useCases.archive(id);
  }

  @Post(':pipelineId/clone')
  @ApiOperation({ summary: 'Clone a pipeline' })
  @ApiCreatedResponse({ type: SinglePipelineResponseDto })
  public async clone(
    @Param('pipelineId', new ParseUUIDPipe()) id: string,
    @Body() input: ClonePipelineDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SinglePipelineResponseDto> {
    return SinglePipelineResponseDto.from(
      await this.useCases.clone(id, input.name),
      responseMeta(response),
    );
  }

  @Post(':pipelineId/validate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate a saved pipeline' })
  @ApiOkResponse({ type: PipelineValidationResponseDto })
  public async validateSaved(
    @Param('pipelineId', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PipelineValidationResponseDto> {
    return PipelineValidationResponseDto.from(
      await this.useCases.validateSaved(id),
      responseMeta(response),
    );
  }

  @Post(':pipelineId/nodes/:nodeId/preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview a pipeline node output' })
  @ApiOkResponse({ type: PipelinePreviewResponseDto })
  public async preview(
    @Param('pipelineId', new ParseUUIDPipe()) id: string,
    @Param('nodeId') nodeId: string,
    @Body() input: PreviewPipelineNodeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PipelinePreviewResponseDto> {
    return PipelinePreviewResponseDto.from(
      await this.useCases.preview(id, nodeId, input.pipelineVersion, input.limit),
      responseMeta(response),
    );
  }
}

function responseMeta(response: Response): ResponseMetaValue {
  const current = response.getHeader('X-Request-Id');
  const requestId = typeof current === 'string' && current !== '' ? current : randomUUID();
  if (current !== requestId) response.setHeader('X-Request-Id', requestId);
  return { requestId, timestamp: new Date().toISOString() };
}

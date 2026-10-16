import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AssignMetadataCrawlerRequestDto,
  MetadataCrawlerListQueryDto,
  MetadataCrawlerRunListQueryDto,
  UpdateMetadataCrawlerRequestDto,
} from '@presentation/metadata-crawler/metadata-crawler.dto';
import {
  MetadataCrawlerAssignableDatabaseServiceResponseDto,
  MetadataCrawlerListResponseDto,
  MetadataCrawlerLogResponseDto,
  MetadataCrawlerResponseDto,
  MetadataCrawlerRunResponseDto,
} from '@presentation/metadata-crawler/metadata-crawler.response';
import {
  MetadataCrawlerUseCases,
  type AssignMetadataCrawlerCommand,
  type UpdateMetadataCrawlerCommand,
} from '@application/metadata-crawler/metadata-crawler.use-cases';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('metadata-crawlers')
@Controller()
@RequireWorkspaceFeature('CRAWLER')
export class MetadataCrawlerController {
  public constructor(private readonly useCases: MetadataCrawlerUseCases) {}

  @Get('metadata-crawlers')
  @ApiOperation({ summary: 'List metadata crawlers' })
  @ApiOkResponse({ type: MetadataCrawlerListResponseDto })
  public async list(
    @Query() query: MetadataCrawlerListQueryDto,
  ): Promise<MetadataCrawlerListResponseDto> {
    return MetadataCrawlerListResponseDto.from(await this.useCases.list(query.includeArchived));
  }

  @Post('metadata-crawlers')
  @ApiOperation({ summary: 'Assign a metadata crawler to a database service' })
  @ApiCreatedResponse({ type: MetadataCrawlerResponseDto })
  public async assign(
    @Body() request: AssignMetadataCrawlerRequestDto,
  ): Promise<MetadataCrawlerResponseDto> {
    const command: AssignMetadataCrawlerCommand = {
      databaseServiceId: request.databaseServiceId,
      name: request.name,
      schedule: request.schedule,
      discovery: request.discovery as AssignMetadataCrawlerCommand['discovery'],
      timeoutSeconds: request.timeoutSeconds,
    };
    return MetadataCrawlerResponseDto.from(await this.useCases.assign(command));
  }

  @Get('metadata-crawler-database-services')
  @ApiOperation({ summary: 'List eligible database services for assignment' })
  @ApiOkResponse({ type: MetadataCrawlerAssignableDatabaseServiceResponseDto, isArray: true })
  public async listAssignableDatabaseServices(): Promise<
    readonly MetadataCrawlerAssignableDatabaseServiceResponseDto[]
  > {
    const services = await this.useCases.listAssignableDatabaseServices();
    return services.map((service) =>
      MetadataCrawlerAssignableDatabaseServiceResponseDto.from(service),
    );
  }

  @Get('metadata-crawlers/:id')
  @ApiOkResponse({ type: MetadataCrawlerResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MetadataCrawlerResponseDto> {
    return MetadataCrawlerResponseDto.from(await this.useCases.get(id));
  }

  @Patch('metadata-crawlers/:id')
  @ApiOkResponse({ type: MetadataCrawlerResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: UpdateMetadataCrawlerRequestDto,
  ): Promise<MetadataCrawlerResponseDto> {
    const command: UpdateMetadataCrawlerCommand = {
      id,
      name: request.name,
      enabled: request.enabled,
      schedule: request.schedule,
      discovery: request.discovery as UpdateMetadataCrawlerCommand['discovery'],
      timeoutSeconds: request.timeoutSeconds,
    };
    return MetadataCrawlerResponseDto.from(await this.useCases.update(command));
  }

  @Delete('metadata-crawlers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  public archive(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.useCases.archive(id);
  }

  @Post('metadata-crawlers/:id/runs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: MetadataCrawlerRunResponseDto })
  public async runNow(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MetadataCrawlerRunResponseDto> {
    return MetadataCrawlerRunResponseDto.from(await this.useCases.runNow(id));
  }

  @Get('metadata-crawlers/:id/runs')
  @ApiOkResponse({ type: MetadataCrawlerRunResponseDto, isArray: true })
  public async listRuns(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: MetadataCrawlerRunListQueryDto,
  ): Promise<readonly MetadataCrawlerRunResponseDto[]> {
    const runs = await this.useCases.listRuns(id, query.limit);
    return runs.map((run) => MetadataCrawlerRunResponseDto.from(run));
  }

  @Get('metadata-crawler-runs/:runId')
  @ApiOkResponse({ type: MetadataCrawlerRunResponseDto })
  public async getRun(
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ): Promise<MetadataCrawlerRunResponseDto> {
    return MetadataCrawlerRunResponseDto.from(await this.useCases.getRun(runId));
  }

  @Get('metadata-crawler-runs/:runId/logs')
  @ApiOkResponse({ type: MetadataCrawlerLogResponseDto })
  public async getRunLogs(
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ): Promise<MetadataCrawlerLogResponseDto> {
    return Object.assign(
      new MetadataCrawlerLogResponseDto(),
      await this.useCases.getRunLogs(runId),
    );
  }
}

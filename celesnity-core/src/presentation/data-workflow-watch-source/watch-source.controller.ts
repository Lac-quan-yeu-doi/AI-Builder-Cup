import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import { ListWatchSourceCatalogUseCase } from '@application/data-workflow-watch-source/list-watch-source-catalog.use-case';
import { ValidateWatchSourceTriggerUseCase } from '@application/data-workflow-watch-source/validate-watch-source-trigger.use-case';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type {
  WatchSourceCatalogPage,
  WatchSourceCatalogQuery,
  WatchSourceCatalogRelationView,
  WatchSourceCatalogServiceView,
} from '@application/data-workflow-watch-source/read-models/watch-source-catalog.view';
import { WATCH_SOURCE_REPOSITORY } from '@application/data-workflow-watch-source/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { CLOCK } from '@application/shared/tokens';
import { parseWorkflowGraph } from '@application/data-workflow/workflow-graph-input';
import { tryAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { IsDefined, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type {
  WatchSourceCapabilities,
  WatchSourceValidationResult,
} from '@domain/data-workflow-watch-source/models/watch-source';

class WatchSourceValidationDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsDefined()
  @IsObject()
  public readonly trigger!: Record<string, unknown>;
}

class WatchSourceCatalogQueryDto implements WatchSourceCatalogQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly pageSize = 50;

  @IsOptional()
  @IsString()
  public readonly search?: string;
}

@ApiTags('data-workflows')
@Controller('data-workflows/watch-sources')
@RequireWorkspaceFeature('PIPELINES')
export class WatchSourceController {
  public constructor(
    private readonly watchSource: ValidateWatchSourceTriggerUseCase,
    private readonly catalog: ListWatchSourceCatalogUseCase,
    @Optional()
    @Inject(WATCH_SOURCE_REPOSITORY)
    private readonly repository?: IWatchSourceRepository,
    @Optional() @Inject(CLOCK) private readonly clock?: IClock,
  ) {}

  @Get('catalog')
  @ApiOperation({ summary: 'List verified database services available for Watch Source authoring' })
  @ApiOkResponse()
  public services(
    @Req() request: Request,
    @Query() query: WatchSourceCatalogQueryDto,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogServiceView>> {
    return this.catalog.services(actorOf(request), query);
  }

  @Get('catalog/:databaseServiceId/relations')
  @ApiOperation({ summary: 'List verified source relations for Watch Source table selection' })
  @ApiOkResponse()
  public relations(
    @Req() request: Request,
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
    @Query() query: WatchSourceCatalogQueryDto,
  ): Promise<WatchSourceCatalogPage<WatchSourceCatalogRelationView>> {
    return this.catalog.relations(actorOf(request), databaseServiceId, query);
  }

  @Get(':databaseServiceId/capabilities')
  @ApiOperation({ summary: 'Get safe Watch Source polling capabilities for a database service' })
  @ApiOkResponse()
  public capabilities(
    @Req() request: Request,
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
  ): Promise<WatchSourceCapabilities> {
    return this.watchSource.capabilities(actorOf(request), databaseServiceId);
  }

  @Post(':databaseServiceId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a Watch Source trigger without scheduling capture' })
  @ApiOkResponse()
  public async validate(
    @Req() request: Request,
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
    @Body() body: WatchSourceValidationDto,
  ): Promise<WatchSourceValidationResult> {
    const graph = parseWorkflowGraph({
      nodes: [{ id: 'trigger', type: 'TRIGGER', config: body.trigger }],
      edges: [],
    });
    const trigger = graph.nodes[0];
    if (
      trigger?.type !== 'TRIGGER' ||
      trigger.config?.type !== 'WATCH_SOURCE' ||
      trigger.config.databaseServiceId !== databaseServiceId
    ) {
      throw new BadRequestException({
        code: 'WATCH_SOURCE_TRIGGER_MISMATCH',
        message: 'Watch Source trigger does not match the route.',
        details: null,
      });
    }
    return this.watchSource.validate(actorOf(request), trigger.config);
  }

  @Get(':watchSourceId/health')
  @ApiOperation({ summary: 'Get Watch Source checkpoints and delivery coverage' })
  @ApiOkResponse()
  public async health(
    @Req() request: Request,
    @Param('watchSourceId', new ParseUUIDPipe()) watchSourceId: string,
  ): Promise<{
    readonly source: Omit<
      NonNullable<Awaited<ReturnType<IWatchSourceRepository['health']>>>['source'],
      'leaseOwner' | 'leaseToken' | 'leaseExpiresAt'
    >;
    readonly checkpoints: NonNullable<
      Awaited<ReturnType<IWatchSourceRepository['health']>>
    >['checkpoints'];
    readonly delivery: NonNullable<
      Awaited<ReturnType<IWatchSourceRepository['health']>>
    >['delivery'];
    readonly lastCapturedAt?: Date;
  }> {
    const repository = this.requireRepository();
    const view = await repository.health(actorOf(request).organizationId, watchSourceId);
    if (view === undefined) throw new NotFoundException('Watch Source was not found.');
    const source = {
      ...view.source,
      leaseOwner: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
    };
    return { ...view, source };
  }

  @Post(':watchSourceId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry blocked Watch Source deliveries' })
  @ApiOkResponse()
  public async retry(
    @Req() request: Request,
    @Param('watchSourceId', new ParseUUIDPipe()) watchSourceId: string,
  ): Promise<{ readonly requeued: number }> {
    const repository = this.requireRepository();
    const clock = this.clock;
    if (clock === undefined) throw new Error('Watch Source clock is not configured.');
    const requeued = await repository.retryBlocked(
      actorOf(request).organizationId,
      watchSourceId,
      clock.now(),
    );
    return { requeued };
  }

  private requireRepository(): IWatchSourceRepository {
    if (this.repository === undefined)
      throw new Error('Watch Source repository is not configured.');
    return this.repository;
  }
}

function actorOf(request: Request): WorkflowActor {
  const principal = tryAuthenticatedPrincipal(request);
  if (principal === undefined) throw new Error('Unauthenticated request.');
  return { organizationId: principal.organizationId, identityId: principal.identityId };
}

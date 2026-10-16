import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SourceMetadataQueryUseCases } from '@application/metadata-crawler/source-metadata-query.use-cases';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  SourceColumnQueryDto,
  SourceNamespaceQueryDto,
  SourceRelationQueryDto,
  sourceMetadataPageQuery,
} from '@presentation/metadata-crawler/source-metadata.dto';
import {
  pageResponse,
  SourceMetadataColumnResponseDto,
  SourceMetadataConstraintResponseDto,
  SourceMetadataNamespaceResponseDto,
  SourceMetadataPageResponseDto,
  SourceMetadataRelationResponseDto,
  SourceMetadataSummaryResponseDto,
} from '@presentation/metadata-crawler/source-metadata.response';

@ApiTags('metadata-crawler-source-metadata')
@Controller('metadata-crawlers/:crawlerId/metadata')
@RequireWorkspaceFeature('SOURCE_SCHEMA')
export class SourceMetadataController {
  public constructor(private readonly useCases: SourceMetadataQueryUseCases) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get the latest source metadata snapshot summary' })
  @ApiOkResponse({ type: SourceMetadataSummaryResponseDto })
  public async summary(
    @Param('crawlerId', new ParseUUIDPipe()) crawlerId: string,
  ): Promise<SourceMetadataSummaryResponseDto> {
    return SourceMetadataSummaryResponseDto.from(await this.useCases.summary(crawlerId));
  }

  @Get('namespaces')
  @ApiOkResponse({ type: Object })
  public async namespaces(
    @Param('crawlerId', new ParseUUIDPipe()) crawlerId: string,
    @Query() query: SourceNamespaceQueryDto,
  ): Promise<SourceMetadataPageResponseDto<SourceMetadataNamespaceResponseDto>> {
    return pageResponse(
      await this.useCases.listNamespaces(crawlerId, sourceMetadataPageQuery(query)),
      (view) => SourceMetadataNamespaceResponseDto.from(view),
    );
  }

  @Get('namespaces/:namespaceId/relations')
  @ApiOkResponse({ type: Object })
  public async relations(
    @Param('crawlerId', new ParseUUIDPipe()) crawlerId: string,
    @Param('namespaceId', new ParseUUIDPipe()) namespaceId: string,
    @Query() query: SourceRelationQueryDto,
  ): Promise<SourceMetadataPageResponseDto<SourceMetadataRelationResponseDto>> {
    return pageResponse(
      await this.useCases.listRelations(crawlerId, namespaceId, sourceMetadataPageQuery(query)),
      (view) => SourceMetadataRelationResponseDto.from(view),
    );
  }

  @Get('relations/:relationId')
  @ApiOkResponse({ type: SourceMetadataRelationResponseDto })
  public async relation(
    @Param('crawlerId', new ParseUUIDPipe()) crawlerId: string,
    @Param('relationId', new ParseUUIDPipe()) relationId: string,
  ): Promise<SourceMetadataRelationResponseDto> {
    return SourceMetadataRelationResponseDto.from(
      await this.useCases.getRelation(crawlerId, relationId),
    );
  }

  @Get('relations/:relationId/columns')
  @ApiOkResponse({ type: Object })
  public async columns(
    @Param('crawlerId', new ParseUUIDPipe()) crawlerId: string,
    @Param('relationId', new ParseUUIDPipe()) relationId: string,
    @Query() query: SourceColumnQueryDto,
  ): Promise<SourceMetadataPageResponseDto<SourceMetadataColumnResponseDto>> {
    return pageResponse(
      await this.useCases.listColumns(crawlerId, relationId, sourceMetadataPageQuery(query)),
      (view) => SourceMetadataColumnResponseDto.from(view),
    );
  }

  @Get('relations/:relationId/constraints')
  @ApiOkResponse({ type: SourceMetadataConstraintResponseDto, isArray: true })
  public async constraints(
    @Param('crawlerId', new ParseUUIDPipe()) crawlerId: string,
    @Param('relationId', new ParseUUIDPipe()) relationId: string,
  ): Promise<readonly SourceMetadataConstraintResponseDto[]> {
    const constraints = await this.useCases.listConstraints(crawlerId, relationId);
    return constraints.map((constraint) => SourceMetadataConstraintResponseDto.from(constraint));
  }
}

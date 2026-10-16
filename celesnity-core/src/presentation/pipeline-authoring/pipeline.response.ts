import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { NodePreviewResult } from '@application/pipeline-authoring/interfaces/i-pipeline-node-previewer';
import type { PipelinePage } from '@application/pipeline-authoring/pipeline-authoring.use-cases';
import type {
  Pipeline,
  PipelineValidationResult,
} from '@domain/pipeline-authoring/models/pipeline';
import { summarizePipelineGraph } from '@domain/pipeline-authoring/models/pipeline-graph-summary';
import {
  ResponseMetaDto,
  type ResponseMetaValue,
} from '@presentation/node-catalog/node-catalog.response';

export class PipelineDataResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional() public readonly databaseName?: string;
  @ApiPropertyOptional() public readonly description?: string;
  @ApiProperty() public readonly status!: 'DRAFT';
  @ApiProperty() public readonly version!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly graph!: Pipeline['graph'];
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly createdBy!: Pipeline['createdBy'];
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  public static from(value: Pipeline): PipelineDataResponseDto {
    return Object.assign(new PipelineDataResponseDto(), value);
  }
}

export class PipelineSummaryResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional() public readonly databaseName?: string;
  @ApiPropertyOptional() public readonly description?: string;
  @ApiProperty() public readonly status!: 'DRAFT';
  @ApiProperty() public readonly version!: number;
  @ApiPropertyOptional({ nullable: true }) public readonly lastRunStatus!: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  public readonly lastRunAt!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Iceberg database the target node writes into. Null for a draft with no target, ' +
      'and for a graph whose targets name more than one database.',
  })
  public readonly targetDatabase!: string | null;
  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Database services the source nodes read through.',
  })
  public readonly sourceConnectionIds!: readonly string[];
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly createdBy!: Pipeline['createdBy'];
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  public static from(value: Pipeline): PipelineSummaryResponseDto {
    // `databaseName` is where the pipeline is filed, set when it is created;
    // `targetDatabase` is where its graph actually writes. They usually agree,
    // and the pair is what lets a client show a draft under its database before
    // a target node exists, and spot a pipeline that drifted away from it.
    const graphSummary = summarizePipelineGraph(value.graph);

    return Object.assign(new PipelineSummaryResponseDto(), {
      id: value.id,
      name: value.name,
      ...(value.databaseName === undefined ? {} : { databaseName: value.databaseName }),
      ...(value.description === undefined ? {} : { description: value.description }),
      status: value.status,
      version: value.version,
      lastRunStatus: null,
      lastRunAt: null,
      targetDatabase: graphSummary.targetDatabase,
      sourceConnectionIds: graphSummary.sourceConnectionIds,
      createdBy: value.createdBy,
      updatedAt: value.updatedAt,
    });
  }
}

export class SinglePipelineResponseDto {
  @ApiProperty() public readonly success = true;
  @ApiProperty({ type: PipelineDataResponseDto }) public readonly data!: PipelineDataResponseDto;
  @ApiProperty({ type: ResponseMetaDto }) public readonly meta!: ResponseMetaDto;
  public static from(value: Pipeline, meta: ResponseMetaValue): SinglePipelineResponseDto {
    return Object.assign(new SinglePipelineResponseDto(), {
      data: PipelineDataResponseDto.from(value),
      meta: ResponseMetaDto.from(meta),
    });
  }
}

export class PipelinePaginationResponseDto {
  @ApiProperty() public readonly page!: number;
  @ApiProperty() public readonly pageSize!: number;
  @ApiProperty() public readonly totalItems!: number;
  @ApiProperty() public readonly totalPages!: number;
  @ApiProperty() public readonly hasNext!: boolean;
  @ApiProperty() public readonly hasPrevious!: boolean;
}

export class PipelineCollectionResponseDto {
  @ApiProperty() public readonly success = true;
  @ApiProperty({ type: PipelineSummaryResponseDto, isArray: true })
  public readonly data!: readonly PipelineSummaryResponseDto[];
  @ApiProperty({ type: PipelinePaginationResponseDto })
  public readonly pagination!: PipelinePaginationResponseDto;
  @ApiProperty({ type: ResponseMetaDto }) public readonly meta!: ResponseMetaDto;
  public static from(page: PipelinePage, meta: ResponseMetaValue): PipelineCollectionResponseDto {
    return Object.assign(new PipelineCollectionResponseDto(), {
      data: page.items.map((pipeline) => PipelineSummaryResponseDto.from(pipeline)),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        totalItems: page.totalItems,
        totalPages: page.totalPages,
        hasNext: page.page < page.totalPages,
        hasPrevious: page.page > 1,
      },
      meta: ResponseMetaDto.from(meta),
    });
  }
}

export class PipelineValidationResponseDto {
  @ApiProperty() public readonly success = true;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly data!:
    PipelineValidationResult | Pick<PipelineValidationResult, 'valid' | 'errors'>;
  @ApiProperty({ type: ResponseMetaDto }) public readonly meta!: ResponseMetaDto;
  public static from(
    data: PipelineValidationResponseDto['data'],
    meta: ResponseMetaValue,
  ): PipelineValidationResponseDto {
    return Object.assign(new PipelineValidationResponseDto(), {
      data,
      meta: ResponseMetaDto.from(meta),
    });
  }
}

export class PipelinePreviewResponseDto {
  @ApiProperty() public readonly success = true;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly data!: NodePreviewResult;
  @ApiProperty({ type: ResponseMetaDto }) public readonly meta!: ResponseMetaDto;
  public static from(data: NodePreviewResult, meta: ResponseMetaValue): PipelinePreviewResponseDto {
    return Object.assign(new PipelinePreviewResponseDto(), {
      data,
      meta: ResponseMetaDto.from(meta),
    });
  }
}

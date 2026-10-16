import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { NodeDefinitionPage } from '@application/node-catalog/node-catalog.use-cases';
import type {
  NodeCategoryDefinition,
  NodeDefinition,
  NodeDefinitionSummary,
  NodePortDefinition,
  NodePropertyField,
  NodePropertySection,
  NodeSourceBinding,
  NodeTargetBinding,
} from '@domain/node-catalog/models/node-definition';

export interface ResponseMetaValue {
  readonly requestId: string;
  readonly timestamp: string;
}

export class ResponseMetaDto {
  @ApiProperty()
  public readonly requestId!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly timestamp!: string;

  public static from(value: ResponseMetaValue): ResponseMetaDto {
    return Object.assign(new ResponseMetaDto(), value);
  }
}

export class NodeCategoryResponseDto {
  @ApiProperty({ enum: ['SOURCE', 'TRANSFORM', 'TARGET'] })
  public readonly type!: string;

  @ApiProperty()
  public readonly label!: string;

  @ApiProperty({ minimum: 1 })
  public readonly order!: number;

  public static from(value: NodeCategoryDefinition): NodeCategoryResponseDto {
    return Object.assign(new NodeCategoryResponseDto(), value);
  }
}

export class NodePortResponseDto {
  @ApiProperty()
  public readonly id!: string;

  @ApiProperty()
  public readonly label!: string;

  @ApiProperty({ enum: ['DATASET'] })
  public readonly dataType!: 'DATASET';

  @ApiProperty()
  public readonly required!: boolean;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  public readonly maxConnections!: number | null;

  public static from(value: NodePortDefinition): NodePortResponseDto {
    return Object.assign(new NodePortResponseDto(), value);
  }
}

export class NodePropertyOptionResponseDto {
  @ApiProperty()
  public readonly label!: string;

  @ApiProperty()
  public readonly value!: string;
}

export class NodePropertyVisibilityResponseDto {
  @ApiProperty()
  public readonly field!: string;

  @ApiProperty()
  public readonly equals!: unknown;
}

export class NodePropertyFieldResponseDto {
  @ApiProperty()
  public readonly key!: string;

  @ApiProperty()
  public readonly label!: string;

  @ApiProperty({
    enum: [
      'TEXT_INPUT',
      'MULTI_SELECT',
      'SELECT',
      'RADIO',
      'SQL_EDITOR',
      'KEY_VALUE',
      'FILTER_BUILDER',
      'COLUMN_MAPPING_BUILDER',
      'ORDER_BY_BUILDER',
      'AGGREGATION_BUILDER',
      'TYPED_VALUE',
    ],
  })
  public readonly component!: string;

  @ApiProperty()
  public readonly required!: boolean;

  @ApiPropertyOptional()
  public readonly description?: string;

  @ApiPropertyOptional()
  public readonly defaultValue?: unknown;

  @ApiPropertyOptional({ type: String, isArray: true })
  public readonly dependsOn?: readonly string[];

  @ApiPropertyOptional({ type: NodePropertyVisibilityResponseDto })
  public readonly visibleWhen?: NodePropertyVisibilityResponseDto;

  @ApiPropertyOptional({ type: NodePropertyOptionResponseDto, isArray: true })
  public readonly options?: readonly NodePropertyOptionResponseDto[];

  public static from(value: NodePropertyField): NodePropertyFieldResponseDto {
    return Object.assign(new NodePropertyFieldResponseDto(), value, {
      options: value.options?.map((option) =>
        Object.assign(new NodePropertyOptionResponseDto(), option),
      ),
    });
  }
}

export class NodePropertySectionResponseDto {
  @ApiProperty()
  public readonly id!: string;

  @ApiProperty()
  public readonly title!: string;

  @ApiProperty({ type: NodePropertyFieldResponseDto, isArray: true })
  public readonly fields!: readonly NodePropertyFieldResponseDto[];

  public static from(value: NodePropertySection): NodePropertySectionResponseDto {
    return Object.assign(new NodePropertySectionResponseDto(), value, {
      fields: value.fields.map((field) => NodePropertyFieldResponseDto.from(field)),
    });
  }
}

export class NodePropertyPanelResponseDto {
  @ApiProperty({ type: NodePropertySectionResponseDto, isArray: true })
  public readonly sections!: readonly NodePropertySectionResponseDto[];
}

export class NodeDefinitionSummaryResponseDto {
  @ApiProperty()
  public readonly resourceId!: string;

  @ApiProperty()
  public readonly type!: string;

  @ApiProperty({ enum: ['SOURCE', 'TRANSFORM', 'TARGET'] })
  public readonly category!: string;

  @ApiProperty()
  public readonly label!: string;

  @ApiProperty()
  public readonly description!: string;

  @ApiProperty()
  public readonly iconKey!: string;

  @ApiProperty()
  public readonly enabled!: boolean;

  @ApiProperty({
    enum: ['SPARK_DATAFRAME', 'SPARK_JDBC_SOURCE', 'SPARK_ICEBERG_SOURCE', 'SPARK_ICEBERG_TARGET'],
  })
  public readonly runtimeKind!:
    'SPARK_DATAFRAME' | 'SPARK_JDBC_SOURCE' | 'SPARK_ICEBERG_SOURCE' | 'SPARK_ICEBERG_TARGET';

  @ApiProperty({ type: NodePortResponseDto, isArray: true })
  public readonly inputPorts!: readonly NodePortResponseDto[];

  @ApiProperty({ type: NodePortResponseDto, isArray: true })
  public readonly outputPorts!: readonly NodePortResponseDto[];

  @ApiPropertyOptional({ type: () => NodeSourceBindingResponseDto })
  public readonly source?: NodeSourceBinding;

  @ApiPropertyOptional({ type: () => NodeTargetBindingResponseDto })
  public readonly target?: NodeTargetBinding;

  public static from(value: NodeDefinitionSummary): NodeDefinitionSummaryResponseDto {
    return Object.assign(new NodeDefinitionSummaryResponseDto(), value, {
      inputPorts: value.inputPorts.map((port) => NodePortResponseDto.from(port)),
      outputPorts: value.outputPorts.map((port) => NodePortResponseDto.from(port)),
      source:
        value.source === undefined ? undefined : NodeSourceBindingResponseDto.from(value.source),
      target:
        value.target === undefined ? undefined : NodeTargetBindingResponseDto.from(value.target),
    });
  }
}

export class NodeSourceBindingResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly connectionId!: string;

  @ApiProperty()
  public readonly connectionName!: string;

  @ApiProperty()
  public readonly dbmsType!: string;

  @ApiProperty({ minimum: 1 })
  public readonly configSchemaVersion!: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly config!: Readonly<Record<string, unknown>>;

  @ApiProperty()
  public readonly verificationStatus!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly lastTestedAt?: string;

  @ApiPropertyOptional()
  public readonly lastTestError?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(value: NodeSourceBinding): NodeSourceBindingResponseDto {
    return Object.assign(new NodeSourceBindingResponseDto(), value);
  }
}

export class NodeTargetBindingResponseDto {
  @ApiProperty()
  public readonly catalogName!: string;

  @ApiProperty({ description: 'Iceberg namespace used as the destination database.' })
  public readonly databaseName!: string;

  @ApiProperty()
  public readonly tableName!: string;

  @ApiProperty()
  public readonly tableType!: string;

  @ApiProperty({ enum: ['ICEBERG'] })
  public readonly storageFormat!: 'ICEBERG';

  public static from(value: NodeTargetBinding): NodeTargetBindingResponseDto {
    return Object.assign(new NodeTargetBindingResponseDto(), value);
  }
}

export class NodeDefinitionResponseDto extends NodeDefinitionSummaryResponseDto {
  @ApiProperty({ type: NodePropertyPanelResponseDto })
  public readonly propertyPanel!: NodePropertyPanelResponseDto;

  public static override from(value: NodeDefinition): NodeDefinitionResponseDto {
    return Object.assign(new NodeDefinitionResponseDto(), super.from(value), {
      propertyPanel: Object.assign(new NodePropertyPanelResponseDto(), {
        sections: value.propertyPanel.sections.map((section) =>
          NodePropertySectionResponseDto.from(section),
        ),
      }),
    });
  }
}

export class PaginationResponseDto {
  @ApiProperty({ minimum: 1 })
  public readonly page!: number;

  @ApiProperty({ minimum: 1 })
  public readonly pageSize!: number;

  @ApiProperty({ minimum: 0 })
  public readonly totalItems!: number;

  @ApiProperty({ minimum: 0 })
  public readonly totalPages!: number;

  @ApiProperty()
  public readonly hasNext!: boolean;

  @ApiProperty()
  public readonly hasPrevious!: boolean;
}

export class NodeCategoryCollectionResponseDto {
  @ApiProperty({ example: true })
  public readonly success!: true;

  @ApiProperty({ type: NodeCategoryResponseDto, isArray: true })
  public readonly data!: readonly NodeCategoryResponseDto[];

  @ApiProperty({ type: ResponseMetaDto })
  public readonly meta!: ResponseMetaDto;

  public static from(
    values: readonly NodeCategoryDefinition[],
    meta: ResponseMetaValue,
  ): NodeCategoryCollectionResponseDto {
    return Object.assign(new NodeCategoryCollectionResponseDto(), {
      success: true as const,
      data: values.map((value) => NodeCategoryResponseDto.from(value)),
      meta: ResponseMetaDto.from(meta),
    });
  }
}

export class NodeDefinitionCollectionResponseDto {
  @ApiProperty({ example: true })
  public readonly success!: true;

  @ApiProperty({ type: NodeDefinitionSummaryResponseDto, isArray: true })
  public readonly data!: readonly NodeDefinitionSummaryResponseDto[];

  @ApiProperty({ type: PaginationResponseDto })
  public readonly pagination!: PaginationResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  public readonly meta!: ResponseMetaDto;

  public static from(
    page: NodeDefinitionPage,
    meta: ResponseMetaValue,
  ): NodeDefinitionCollectionResponseDto {
    return Object.assign(new NodeDefinitionCollectionResponseDto(), {
      success: true as const,
      data: page.items.map((item) => NodeDefinitionSummaryResponseDto.from(item)),
      pagination: Object.assign(new PaginationResponseDto(), {
        page: page.page,
        pageSize: page.pageSize,
        totalItems: page.totalItems,
        totalPages: page.totalPages,
        hasNext: page.page < page.totalPages,
        hasPrevious: page.page > 1 && page.totalItems > 0,
      }),
      meta: ResponseMetaDto.from(meta),
    });
  }
}

export class SingleNodeDefinitionResponseDto {
  @ApiProperty({ example: true })
  public readonly success!: true;

  @ApiProperty({ type: NodeDefinitionResponseDto })
  public readonly data!: NodeDefinitionResponseDto;

  @ApiProperty({ type: ResponseMetaDto })
  public readonly meta!: ResponseMetaDto;

  public static from(
    value: NodeDefinition,
    meta: ResponseMetaValue,
  ): SingleNodeDefinitionResponseDto {
    return Object.assign(new SingleNodeDefinitionResponseDto(), {
      success: true as const,
      data: NodeDefinitionResponseDto.from(value),
      meta: ResponseMetaDto.from(meta),
    });
  }
}

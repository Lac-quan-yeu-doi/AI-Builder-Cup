import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  SourceColumnView,
  SourceConstraintView,
  SourceMetadataPage,
  SourceMetadataSnapshotSummary,
  SourceNamespaceView,
  SourceRelationView,
} from '@application/metadata-crawler/read-models/source-metadata.view';

export class SourceMetadataSummaryResponseDto {
  @ApiProperty() public readonly hasSnapshot!: boolean;
  @ApiProperty() public readonly databaseCount!: number;
  @ApiProperty() public readonly schemaCount!: number;
  @ApiProperty() public readonly relationCount!: number;
  @ApiProperty() public readonly columnCount!: number;
  @ApiProperty() public readonly constraintCount!: number;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly lastCrawledAt?: string;

  public static from(view: SourceMetadataSnapshotSummary): SourceMetadataSummaryResponseDto {
    return Object.assign(new SourceMetadataSummaryResponseDto(), view);
  }
}

export class SourceMetadataNamespaceResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly type!: string;
  @ApiPropertyOptional() public readonly description?: string;
  @ApiProperty() public readonly relationCount!: number;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly lastCrawledAt?: string;

  public static from(view: SourceNamespaceView): SourceMetadataNamespaceResponseDto {
    return Object.assign(new SourceMetadataNamespaceResponseDto(), view);
  }
}

export class SourceMetadataRelationResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly namespaceId!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly relationType!: string;
  @ApiPropertyOptional() public readonly description?: string;
  @ApiProperty() public readonly columnCount!: number;
  @ApiPropertyOptional() public readonly ddl?: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly properties!: Record<
    string,
    unknown
  >;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly lastCrawledAt?: string;

  public static from(view: SourceRelationView): SourceMetadataRelationResponseDto {
    return Object.assign(new SourceMetadataRelationResponseDto(), view);
  }
}

export class SourceMetadataColumnResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly relationId!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly ordinalPosition!: number;
  @ApiProperty() public readonly nativeType!: string;
  @ApiProperty() public readonly canonicalType!: string;
  @ApiProperty() public readonly nullable!: boolean;
  @ApiPropertyOptional() public readonly defaultValue?: string;
  @ApiPropertyOptional() public readonly description?: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly properties!: Record<
    string,
    unknown
  >;

  public static from(view: SourceColumnView): SourceMetadataColumnResponseDto {
    return Object.assign(new SourceMetadataColumnResponseDto(), view);
  }
}

export class SourceMetadataConstraintResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly constraintType!: string;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  public readonly columns!: SourceConstraintView['columns'];
  @ApiPropertyOptional() public readonly referencedRelationPath?: string;
  @ApiPropertyOptional() public readonly checkExpression?: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly properties!: Record<
    string,
    unknown
  >;

  public static from(view: SourceConstraintView): SourceMetadataConstraintResponseDto {
    return Object.assign(new SourceMetadataConstraintResponseDto(), view);
  }
}

export class SourceMetadataPaginationResponseDto {
  @ApiProperty() public readonly page!: number;
  @ApiProperty() public readonly pageSize!: number;
  @ApiProperty() public readonly total!: number;
  @ApiProperty() public readonly totalPages!: number;
}

export class SourceMetadataSortResponseDto {
  @ApiProperty() public readonly field!: string;
  @ApiProperty() public readonly direction!: string;
}

export class SourceMetadataPageResponseDto<T> {
  @ApiProperty({ type: 'array', items: { type: 'object' } }) public readonly items!: readonly T[];
  @ApiProperty({ type: SourceMetadataPaginationResponseDto })
  public readonly pagination!: SourceMetadataPaginationResponseDto;
  @ApiProperty({ type: SourceMetadataSortResponseDto })
  public readonly sort!: SourceMetadataSortResponseDto;
}

export function pageResponse<TView, TResponse>(
  page: SourceMetadataPage<TView>,
  map: (view: TView) => TResponse,
): SourceMetadataPageResponseDto<TResponse> {
  return Object.assign(new SourceMetadataPageResponseDto<TResponse>(), {
    items: page.items.map(map),
    pagination: Object.assign(new SourceMetadataPaginationResponseDto(), page.pagination),
    sort: Object.assign(new SourceMetadataSortResponseDto(), page.sort),
  });
}

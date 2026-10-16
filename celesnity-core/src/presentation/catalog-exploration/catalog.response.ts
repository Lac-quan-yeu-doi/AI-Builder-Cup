import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  PreviewColumn,
  TablePreview,
} from '@application/catalog-exploration/interfaces/i-catalog-reader';
import type {
  Catalog,
  ColumnMetadata,
  ColumnProfile,
  Namespace,
  TableMetadata,
  TableSnapshot,
  TableSummary,
} from '@domain/catalog-exploration/models/catalog-models';

export class CatalogResponseDto {
  @ApiProperty({ example: 'iceberg', description: 'Trino-facing catalog alias.' })
  public readonly name!: string;

  @ApiProperty({
    example: 'celesnity',
    description: 'Underlying Iceberg JDBC catalog identity.',
  })
  public readonly jdbcCatalogIdentity!: string;

  public static from(model: Catalog): CatalogResponseDto {
    return Object.assign(new CatalogResponseDto(), {
      name: model.name,
      jdbcCatalogIdentity: model.jdbcCatalogIdentity,
    });
  }
}

export class NamespaceResponseDto {
  @ApiProperty({ example: 'iceberg' })
  public readonly catalog!: string;

  @ApiProperty({ example: 'analytics' })
  public readonly name!: string;

  @ApiPropertyOptional({ example: 'Curated sales data for reporting.' })
  public readonly description?: string;

  public static from(model: Namespace): NamespaceResponseDto {
    return Object.assign(new NamespaceResponseDto(), {
      catalog: model.catalog,
      name: model.name,
      description: model.description,
    });
  }
}

export class TableSummaryResponseDto {
  @ApiProperty({ example: 'iceberg' })
  public readonly catalog!: string;

  @ApiProperty({ example: 'analytics' })
  public readonly schema!: string;

  @ApiProperty({ example: 'orders' })
  public readonly name!: string;

  @ApiProperty({ example: 'BASE TABLE' })
  public readonly tableType!: string;

  public static from(model: TableSummary): TableSummaryResponseDto {
    return Object.assign(new TableSummaryResponseDto(), {
      catalog: model.catalog,
      schema: model.schema,
      name: model.name,
      tableType: model.tableType,
    });
  }
}

export class ColumnMetadataResponseDto {
  @ApiProperty({ example: 'customer_id' })
  public readonly name!: string;

  @ApiProperty({ example: 'bigint', description: 'Trino-visible data type.' })
  public readonly dataType!: string;

  @ApiProperty({ example: true })
  public readonly nullable!: boolean;

  @ApiProperty({ minimum: 1, example: 1 })
  public readonly ordinalPosition!: number;

  @ApiPropertyOptional({ nullable: true })
  public readonly comment?: string;

  public static from(model: ColumnMetadata): ColumnMetadataResponseDto {
    return Object.assign(new ColumnMetadataResponseDto(), {
      name: model.name,
      dataType: model.dataType,
      nullable: model.nullable,
      ordinalPosition: model.ordinalPosition,
      comment: model.comment,
    });
  }
}

export class TableMetadataResponseDto {
  @ApiProperty({ example: 'iceberg' })
  public readonly catalog!: string;

  @ApiProperty({ example: 'analytics' })
  public readonly schema!: string;

  @ApiProperty({ example: 'orders' })
  public readonly name!: string;

  @ApiProperty({ type: ColumnMetadataResponseDto, isArray: true })
  public readonly columns!: readonly ColumnMetadataResponseDto[];

  public static from(model: TableMetadata): TableMetadataResponseDto {
    return Object.assign(new TableMetadataResponseDto(), {
      catalog: model.catalog,
      schema: model.schema,
      name: model.name,
      columns: model.columns.map((column) => ColumnMetadataResponseDto.from(column)),
    });
  }
}

export class TableSnapshotResponseDto {
  @ApiProperty({ example: '3821550127947089008', description: 'Iceberg snapshot identifier.' })
  public readonly snapshotId!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Parent snapshot identifier, if any.' })
  public readonly parentId?: string;

  @ApiProperty({ example: '2024-01-01 00:00:00.000 UTC' })
  public readonly committedAt!: string;

  @ApiPropertyOptional({ example: 'append' })
  public readonly operation?: string;

  @ApiPropertyOptional({ description: 'Location of the Iceberg manifest list.' })
  public readonly manifestList?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Snapshot summary key/value pairs reported by Trino.',
  })
  public readonly summary!: Readonly<Record<string, string>>;

  public static from(model: TableSnapshot): TableSnapshotResponseDto {
    return Object.assign(new TableSnapshotResponseDto(), {
      snapshotId: model.snapshotId,
      parentId: model.parentId,
      committedAt: model.committedAt,
      operation: model.operation,
      manifestList: model.manifestList,
      summary: model.summary,
    });
  }
}

export class PreviewColumnResponseDto {
  @ApiProperty({ example: 'customer_id' })
  public readonly name!: string;

  @ApiProperty({ example: 'bigint' })
  public readonly type!: string;

  public static from(column: PreviewColumn): PreviewColumnResponseDto {
    return Object.assign(new PreviewColumnResponseDto(), {
      name: column.name,
      type: column.type,
    });
  }
}

export class TablePreviewResponseDto {
  @ApiProperty({ type: PreviewColumnResponseDto, isArray: true })
  public readonly columns!: readonly PreviewColumnResponseDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: {} },
    description: 'Row values aligned positionally to columns.',
  })
  public readonly rows!: readonly (readonly unknown[])[];

  @ApiProperty({ minimum: 0, description: 'Number of rows returned in this preview.' })
  public readonly rowCount!: number;

  public static from(preview: TablePreview): TablePreviewResponseDto {
    return Object.assign(new TablePreviewResponseDto(), {
      columns: preview.columns.map((column) => PreviewColumnResponseDto.from(column)),
      rows: preview.rows,
      rowCount: preview.rows.length,
    });
  }
}

export class ColumnProfileResponseDto {
  @ApiProperty({ example: 'status' })
  public readonly name!: string;

  @ApiProperty({ example: 'varchar(20)', description: 'Trino-visible data type.' })
  public readonly dataType!: string;

  @ApiProperty({ enum: ['string', 'numeric', 'other'] })
  public readonly kind!: 'string' | 'numeric' | 'other';

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    description: 'Up to 100 distinct values, present only for categorical string columns.',
  })
  public readonly topValues?: readonly string[];

  @ApiPropertyOptional({ description: 'Present only for numeric columns.' })
  public readonly min?: number;

  @ApiPropertyOptional({ description: 'Present only for numeric columns.' })
  public readonly max?: number;

  @ApiPropertyOptional({ description: 'Present only for numeric columns.' })
  public readonly avg?: number;

  @ApiProperty({ example: '2026-09-02T12:00:00.000Z' })
  public readonly computedAt!: string;

  public static from(model: ColumnProfile): ColumnProfileResponseDto {
    return Object.assign(new ColumnProfileResponseDto(), {
      name: model.name,
      dataType: model.dataType,
      kind: model.kind,
      topValues: model.topValues,
      min: model.min,
      max: model.max,
      avg: model.avg,
      computedAt: model.computedAt,
    });
  }
}

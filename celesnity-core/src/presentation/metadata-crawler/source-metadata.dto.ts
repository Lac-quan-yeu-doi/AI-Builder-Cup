import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SourceMetadataPageDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  public readonly pageSize = 50;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public readonly search?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  public readonly sortDirection: 'asc' | 'desc' = 'asc';
}

export class SourceNamespaceQueryDto extends SourceMetadataPageDto {
  @ApiPropertyOptional({ enum: ['name', 'relationCount', 'lastCrawledAt'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'relationCount', 'lastCrawledAt'])
  public readonly sortBy: 'name' | 'relationCount' | 'lastCrawledAt' = 'name';
}

export class SourceRelationQueryDto extends SourceMetadataPageDto {
  @ApiPropertyOptional({
    enum: ['name', 'relationType', 'columnCount', 'lastCrawledAt'],
    default: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'relationType', 'columnCount', 'lastCrawledAt'])
  public readonly sortBy: 'name' | 'relationType' | 'columnCount' | 'lastCrawledAt' = 'name';
}

export class SourceColumnQueryDto extends SourceMetadataPageDto {
  @ApiPropertyOptional({
    enum: ['ordinalPosition', 'name', 'nativeType', 'nullable'],
    default: 'ordinalPosition',
  })
  @IsOptional()
  @IsIn(['ordinalPosition', 'name', 'nativeType', 'nullable'])
  public readonly sortBy: 'ordinalPosition' | 'name' | 'nativeType' | 'nullable' =
    'ordinalPosition';
}

export function sourceMetadataPageQuery<TSort extends string>(
  query: SourceMetadataPageDto & { readonly sortBy: TSort },
): {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly sortBy: TSort;
  readonly sortDirection: 'asc' | 'desc';
} {
  const search = query.search?.trim();
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(search ? { search: search.slice(0, 200) } : {}),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  };
}

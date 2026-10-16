import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { NODE_CATEGORIES, type NodeCategory } from '@domain/node-catalog/models/node-definition';

export class ListNodeDefinitionsQueryDto {
  @ApiPropertyOptional({ enum: NODE_CATEGORIES })
  @IsOptional()
  @IsIn(NODE_CATEGORIES)
  public readonly category?: NodeCategory;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public readonly keyword?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly pageSize: number = 20;

  @ApiPropertyOptional({ default: 'label', enum: ['label', 'type'] })
  @IsIn(['label', 'type'])
  public readonly sortBy: 'label' | 'type' = 'label';

  @ApiPropertyOptional({ default: 'ASC', enum: ['ASC', 'DESC'] })
  @IsIn(['ASC', 'DESC'])
  public readonly sortDirection: 'ASC' | 'DESC' = 'ASC';
}

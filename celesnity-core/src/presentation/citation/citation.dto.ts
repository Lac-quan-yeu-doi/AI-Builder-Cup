import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CitationRefDto {
  @ApiProperty({ enum: ['chart', 'document'] })
  @IsIn(['chart', 'document'])
  public readonly type!: 'chart' | 'document';

  @ApiProperty()
  @IsString()
  public readonly id!: string;

  @ApiProperty({ required: false, description: '1-indexed. Only used for document citations.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly page?: number;
}

export class ResolveCitationsDto {
  @ApiProperty({ type: CitationRefDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CitationRefDto)
  public readonly citations!: readonly CitationRefDto[];
}

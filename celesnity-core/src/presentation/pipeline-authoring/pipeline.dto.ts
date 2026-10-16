import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PipelinePositionDto {
  @ApiProperty() @IsNumber() public readonly x!: number;
  @ApiProperty() @IsNumber() public readonly y!: number;
}

export class PipelineNodeDto {
  @ApiProperty() @IsString() @MaxLength(120) public readonly id!: string;
  @ApiProperty() @IsString() @MaxLength(80) public readonly definitionType!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  public readonly resourceId?: string;
  @ApiProperty({ type: PipelinePositionDto })
  @ValidateNested()
  @Type(() => PipelinePositionDto)
  public readonly position!: PipelinePositionDto;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly config!: Readonly<Record<string, unknown>>;
}

export class PipelineEdgeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) public readonly id?: string;
  @ApiProperty() @IsString() @MaxLength(120) public readonly sourceNodeId!: string;
  @ApiProperty() @IsString() @MaxLength(120) public readonly sourcePortId!: string;
  @ApiProperty() @IsString() @MaxLength(120) public readonly targetNodeId!: string;
  @ApiProperty() @IsString() @MaxLength(120) public readonly targetPortId!: string;
}

export class PipelineGraphDto {
  @ApiProperty({ type: PipelineNodeDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PipelineNodeDto)
  public readonly nodes!: readonly PipelineNodeDto[];
  @ApiProperty({ type: PipelineEdgeDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => PipelineEdgeDto)
  public readonly edges!: readonly PipelineEdgeDto[];
}

export class SavePipelineDto {
  @ApiProperty({ maxLength: 160 }) @IsString() @MaxLength(160) public readonly name!: string;
  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Iceberg database the pipeline is filed under.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public readonly databaseName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  public readonly description?: string;
  @ApiProperty({ type: PipelineGraphDto })
  @ValidateNested()
  @Type(() => PipelineGraphDto)
  public readonly graph!: PipelineGraphDto;
}

export class UpdatePipelineDto extends SavePipelineDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly version!: number;
}

export class ClonePipelineDto {
  @ApiProperty({ maxLength: 160 }) @IsString() @MaxLength(160) public readonly name!: string;
}

export class ValidatePipelineDto {
  @ApiProperty({ type: PipelineGraphDto })
  @ValidateNested()
  @Type(() => PipelineGraphDto)
  public readonly graph!: PipelineGraphDto;
}

export class ValidateEdgeDto extends ValidatePipelineDto {
  @ApiProperty({ type: PipelineEdgeDto })
  @ValidateNested()
  @Type(() => PipelineEdgeDto)
  public readonly edge!: PipelineEdgeDto;
}

export class PreviewPipelineNodeDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly pipelineVersion!: number;
  @ApiProperty({ default: 100, minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  public readonly limit: number = 100;
}

export class ListPipelinesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) public readonly keyword?: string;
  @ApiPropertyOptional({ enum: ['DRAFT'] })
  @IsOptional()
  @IsIn(['DRAFT'])
  public readonly status?: 'DRAFT';
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page: number = 1;
  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly pageSize: number = 20;
  @ApiPropertyOptional({ default: 'updatedAt', enum: ['name', 'createdAt', 'updatedAt'] })
  @IsIn(['name', 'createdAt', 'updatedAt'])
  public readonly sortBy: 'name' | 'createdAt' | 'updatedAt' = 'updatedAt';
  @ApiPropertyOptional({ default: 'DESC', enum: ['ASC', 'DESC'] })
  @IsIn(['ASC', 'DESC'])
  public readonly sortDirection: 'ASC' | 'DESC' = 'DESC';
}

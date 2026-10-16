import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsIn,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowDraftDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  public readonly name!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly graph!: Readonly<Record<string, unknown>>;
}

export class CreateDataWorkflowDto {
  @ApiProperty({ type: WorkflowDraftDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WorkflowDraftDto)
  public readonly draft!: WorkflowDraftDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() public readonly paused?: boolean;
}

export class UpdateDataWorkflowDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly expectedRevision!: number;
  @ApiProperty({ type: WorkflowDraftDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WorkflowDraftDto)
  public readonly draft!: WorkflowDraftDto;
}

export class PublishDataWorkflowDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly expectedRevision!: number;
}

export class SetDataWorkflowStateDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly expectedRevision!: number;
  @ApiProperty() @IsBoolean() public readonly paused!: boolean;
}

export class PreviewDataWorkflowScheduleDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  public readonly source: 'DRAFT' | 'PUBLISHED' = 'DRAFT';

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  public readonly count: number = 5;
}

export class StartDataWorkflowRunDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly parameters!: Readonly<Record<string, unknown>>;
}

export class RetryDataWorkflowNodeDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  public readonly nodeId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly expectedRevision!: number;
  @ApiProperty() @IsBoolean() public readonly acknowledgeWriteRisk!: boolean;
}

export class DataWorkflowListQueryDto {
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
}

export class DataWorkflowHistoryQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly limit: number = 20;
}

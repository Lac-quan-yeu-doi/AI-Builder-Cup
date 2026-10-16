import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DailyMetadataCrawlerScheduleRequestDto {
  @ApiProperty({ enum: ['DAILY'] })
  @IsIn(['DAILY'])
  public readonly cadence!: 'DAILY';

  @ApiProperty({ example: '01:00' })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
  public readonly timeOfDay!: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  public readonly timezone!: string;
}

export class AssignMetadataCrawlerRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public readonly databaseServiceId!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  public readonly name?: string;

  @ApiProperty({ type: DailyMetadataCrawlerScheduleRequestDto })
  @ValidateNested()
  @Type(() => DailyMetadataCrawlerScheduleRequestDto)
  public readonly schedule!: DailyMetadataCrawlerScheduleRequestDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly discovery?: Record<string, unknown>;

  @ApiPropertyOptional({ minimum: 60, maximum: 86400, default: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  public readonly timeoutSeconds?: number;
}

export class UpdateMetadataCrawlerRequestDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  public readonly name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  public readonly enabled?: boolean;

  @ApiPropertyOptional({ type: DailyMetadataCrawlerScheduleRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DailyMetadataCrawlerScheduleRequestDto)
  public readonly schedule?: DailyMetadataCrawlerScheduleRequestDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly discovery?: Record<string, unknown>;

  @ApiPropertyOptional({ minimum: 60, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  public readonly timeoutSeconds?: number;
}

export class MetadataCrawlerListQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  public readonly includeArchived = false;
}

export class MetadataCrawlerRunListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  public readonly limit = 50;
}

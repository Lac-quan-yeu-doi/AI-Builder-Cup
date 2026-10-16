import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateChartDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) public readonly run_id?: string;
  @ApiProperty() @IsString() @MaxLength(200) public readonly title!: string;
  @ApiProperty() @IsString() @MaxLength(50) public readonly chart_type!: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly encodings?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', isArray: true, additionalProperties: true })
  @IsOptional()
  @IsArray()
  public readonly data?: readonly Record<string, unknown>[];
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly config?: Record<string, unknown>;
  @ApiProperty() @IsString() @Matches(/\S/u) @MaxLength(1_000_000) public readonly sql!: string;
}

export class SetChartDataDto {
  @ApiProperty({ type: 'object', isArray: true, additionalProperties: true })
  @IsArray()
  public readonly data!: readonly Record<string, unknown>[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) public readonly expected_version?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  public readonly sql?: string | null;
}

export class SetChartEncodingsDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly encodings!: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) public readonly expected_version?: number;
}

export class SetChartSpecDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly vl_spec!: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) public readonly expected_version?: number;
}

export class PatchChartDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) public readonly title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  public readonly chart_type?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly encodings?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', isArray: true, additionalProperties: true })
  @IsOptional()
  @IsArray()
  public readonly data?: readonly Record<string, unknown>[];
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly config?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly vl_spec?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) public readonly expected_version?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000)
  public readonly sql?: string | null;
}

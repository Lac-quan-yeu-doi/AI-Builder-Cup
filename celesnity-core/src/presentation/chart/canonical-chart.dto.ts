import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

abstract class CanonicalDraftDto {
  @ApiProperty() @IsString() @MaxLength(200) public readonly title!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  public readonly description?: string | null;
  @ApiProperty() @IsString() @MaxLength(100) public readonly collection_id!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly query_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly visualization_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  public readonly output_schema!: readonly Record<string, unknown>[];
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly parameter_values?: Record<string, unknown>;
}

export class PreviewChartDraftDto extends CanonicalDraftDto {}

export class PreviewChartQueryDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly query_definition!: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly parameter_values?: Record<string, unknown>;
}

/** Compile-only request; unlike preview it never starts an execution. */
export class CompileChartQueryDto extends PreviewChartQueryDto {}

export class CreateCanonicalChartDto extends CanonicalDraftDto {}

export class UpdateCanonicalChartDto extends CanonicalDraftDto {
  @ApiProperty() @IsInt() @Min(1) public readonly expected_revision!: number;
}

export class RunCanonicalChartDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly parameter_values?: Record<string, unknown>;
}

export class MoveCanonicalChartDto {
  @ApiProperty() @IsString() @MaxLength(100) public readonly collection_id!: string;
}

export class RemoveCanonicalChartDto {
  @ApiPropertyOptional({ description: 'Why the chart should be archived.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  public readonly rationale?: string;
}

export class RestoreCanonicalChartRevisionDto {
  @ApiProperty() @IsInt() @Min(1) public readonly expected_revision!: number;
  @ApiProperty() @IsInt() @Min(1) public readonly revision_number!: number;
}

/** Confirmed Chat-to-Chart save: the browser selects the destination collection. */
export class CreateChatCanonicalChartDto {
  @ApiProperty() @IsString() @MaxLength(200) public readonly title!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  public readonly description?: string | null;
  @ApiProperty() @IsString() @MaxLength(100) public readonly collection_id!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly query_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly visualization_definition!: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly parameter_values?: Record<string, unknown>;
}

/** Chat update input; Core derives collection, owner, and provenance. */
export class UpdateChatCanonicalChartDto {
  @ApiProperty() @IsString() @MaxLength(200) public readonly title!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  public readonly description?: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly query_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly visualization_definition!: Record<string, unknown>;
  @ApiProperty() @IsInt() @Min(1) public readonly expected_revision!: number;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly parameter_values?: Record<string, unknown>;
}

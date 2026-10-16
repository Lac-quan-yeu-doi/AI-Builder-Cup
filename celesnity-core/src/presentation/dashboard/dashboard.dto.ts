import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CARD_KINDS = ['CHART', 'HEADING', 'TEXT', 'LINK'] as const;
const FILTER_TYPES = [
  'DATE_PICKER',
  'TIME_GROUPING',
  'LOCATION',
  'TEXT_CATEGORY',
  'NUMBER',
  'BOOLEAN',
  'ID',
] as const;
const PLACEMENT_KINDS = ['TOP_OF_PAGE', 'INLINE_CARD'] as const;
const TARGET_KINDS = ['FIELD', 'NATIVE_QUERY_VARIABLE', 'CONTENT_VARIABLE'] as const;

export class CreateDashboardDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) public readonly name!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  public readonly description?: string | null;
  @ApiProperty() @IsString() @IsNotEmpty() public readonly collection_id!: string;
}

export class DashboardTabDto {
  @ApiProperty() @IsString() @IsNotEmpty() public readonly id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) public readonly name!: string;
  @ApiProperty() @IsInt() @Min(0) public readonly order!: number;
}

export class DashboardGeometryDto {
  @ApiProperty() @IsInt() @Min(0) @Max(23) public readonly x!: number;
  @ApiProperty() @IsInt() @Min(0) public readonly y!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(24) public readonly width!: number;
  @ApiProperty() @IsInt() @Min(1) public readonly height!: number;
}

export class DashboardCardDto {
  @ApiProperty() @IsString() @IsNotEmpty() public readonly id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() public readonly tab_id!: string;
  @ApiProperty({ enum: CARD_KINDS }) @IsIn(CARD_KINDS) public readonly kind!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() public readonly chart_id?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly chart_revision_number?: number | null;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly visualization_overrides?: Readonly<Record<string, unknown>>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  public readonly content?: Readonly<Record<string, string>>;
  @ApiProperty({ type: DashboardGeometryDto })
  @ValidateNested()
  @Type(() => DashboardGeometryDto)
  public readonly geometry!: DashboardGeometryDto;
}

export class DashboardFilterPlacementDto {
  @ApiProperty({ enum: PLACEMENT_KINDS })
  @IsIn(PLACEMENT_KINDS)
  public readonly kind!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() public readonly card_id?: string;
}

export class DashboardFilterDto {
  @ApiProperty() @IsString() @IsNotEmpty() public readonly id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) public readonly slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) public readonly label!: string;
  @ApiProperty({ enum: FILTER_TYPES })
  @IsIn(FILTER_TYPES)
  public readonly semantic_type!: string;
  @ApiProperty() @IsString() @IsNotEmpty() public readonly operator!: string;
  @ApiPropertyOptional({ nullable: true }) @Allow() public readonly default_value!: unknown;
  @ApiProperty() @IsBoolean() public readonly required!: boolean;
  @ApiProperty() @IsBoolean() public readonly multiple!: boolean;
  @ApiPropertyOptional({ nullable: true, type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  public readonly values_source!: Readonly<Record<string, unknown>> | null;
  @ApiProperty({ type: DashboardFilterPlacementDto })
  @ValidateNested()
  @Type(() => DashboardFilterPlacementDto)
  public readonly placement!: DashboardFilterPlacementDto;
  @ApiProperty() @IsInt() @Min(0) public readonly order!: number;
}

export class DashboardFilterTargetDto {
  @ApiProperty({ enum: TARGET_KINDS }) @IsIn(TARGET_KINDS) public readonly kind!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() public readonly field_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() public readonly variable_key?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() public readonly variable_name?: string;
}

export class DashboardFilterMappingDto {
  @ApiProperty() @IsString() @IsNotEmpty() public readonly filter_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() public readonly card_id!: string;
  @ApiProperty({ type: DashboardFilterTargetDto })
  @ValidateNested()
  @Type(() => DashboardFilterTargetDto)
  public readonly target!: DashboardFilterTargetDto;
}

export class SaveDashboardDto {
  @ApiProperty() @IsInt() @Min(1) public readonly expected_revision!: number;
  @ApiProperty() @IsString() @IsNotEmpty() public readonly collection_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) public readonly name!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  public readonly description?: string | null;

  @ApiProperty({ type: DashboardTabDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardTabDto)
  public readonly tabs!: readonly DashboardTabDto[];

  @ApiProperty({ type: DashboardCardDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardCardDto)
  public readonly cards!: readonly DashboardCardDto[];

  @ApiProperty({ type: DashboardFilterDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterDto)
  public readonly filters!: readonly DashboardFilterDto[];

  @ApiProperty({ type: DashboardFilterMappingDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterMappingDto)
  public readonly mappings!: readonly DashboardFilterMappingDto[];
}

export class CopyDashboardDto {
  @ApiProperty() @IsString() @IsNotEmpty() public readonly collection_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) public readonly name!: string;
  @ApiProperty({ type: SaveDashboardDto })
  @ValidateNested()
  @Type(() => SaveDashboardDto)
  public readonly draft!: SaveDashboardDto;
}

export class ExecuteDashboardDto {
  @ApiProperty() @IsString() @IsNotEmpty() public readonly tab_id!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly values!: Readonly<Record<string, unknown>>;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  @MaxLength(128, { each: true })
  public readonly changed_filter_ids?: readonly string[];
}

export class DashboardFilterTargetCardDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(128) public readonly card_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(128) public readonly chart_id!: string;
}

export class PreviewDashboardFilterTargetsDto {
  @ApiProperty({ type: DashboardFilterTargetCardDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterTargetCardDto)
  public readonly cards!: readonly DashboardFilterTargetCardDto[];
}

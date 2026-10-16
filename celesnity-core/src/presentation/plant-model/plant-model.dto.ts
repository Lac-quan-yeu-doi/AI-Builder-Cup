import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  PlantCatalogBinding,
  PlantModelDraft,
  PlantPropertyValue,
} from '@domain/plant-model/models/plant-model';

export class CreatePlantSiteDto {
  @ApiProperty({ maxLength: 160 }) @IsString() @MaxLength(160) public readonly name!: string;
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9_]+$/u)
  public readonly code!: string;
  @ApiPropertyOptional({ default: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  public readonly timezone?: string;
}

export class SavePlantModelDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly draft!: PlantModelDraft;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly expectedRevision!: number;
}

export class ApplyPlantTemplateDto {
  @ApiProperty() @IsString() @MaxLength(120) public readonly templateId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly expectedRevision!: number;
}

export class PublishPlantModelDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly expectedRevision!: number;
  @ApiPropertyOptional({ maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  public readonly note?: string;
}

export class PlantVersionDiffQueryDto {
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) public readonly from!: number;
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) public readonly to!: number;
}

export class PlantCatalogLookupDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly binding!: PlantCatalogBinding;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly nodeValues!: Readonly<Record<string, PlantPropertyValue>>;
}

const PLANT_DASHBOARD_ROLES = [
  'overview',
  'operations',
  'quality',
  'maintenance',
  'custom',
] as const;

export class AssociatePlantDashboardDto {
  @ApiProperty({ enum: PLANT_DASHBOARD_ROLES })
  @IsIn(PLANT_DASHBOARD_ROLES)
  public readonly role!: (typeof PLANT_DASHBOARD_ROLES)[number];

  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) public readonly displayOrder!: number;
  @ApiProperty() @IsBoolean() public readonly isDefault!: boolean;
}

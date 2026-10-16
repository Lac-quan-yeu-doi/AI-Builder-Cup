import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { DeviceLogKind, DeviceLogLevel } from '@domain/device-management/models/device-log';

export class DeviceLogEventRequestDto {
  @ApiProperty({ description: 'Gateway UUID, or a sensor UUID bound to it.' })
  @IsUUID()
  public readonly deviceId!: string;

  @ApiProperty({ description: 'Stable event UUID used for replay idempotency.' })
  @IsUUID()
  public readonly eventId!: string;

  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO', 'DEBUG'] })
  @IsIn(['ERROR', 'WARNING', 'INFO', 'DEBUG'])
  public readonly level!: DeviceLogLevel;

  @ApiProperty({ enum: ['OPERATIONAL', 'FAULT'] })
  @IsIn(['OPERATIONAL', 'FAULT'])
  public readonly kind!: DeviceLogKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  public readonly message!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly context!: Readonly<Record<string, unknown>>;

  @ApiProperty({ description: 'Original device timestamp.' })
  @IsISO8601()
  public readonly observedAt!: string;
}

export class DeviceLogQueryDto {
  @ApiPropertyOptional({ enum: ['ERROR', 'WARNING', 'INFO', 'DEBUG'] })
  @IsOptional()
  @IsIn(['ERROR', 'WARNING', 'INFO', 'DEBUG'])
  public readonly level?: DeviceLogLevel;

  @ApiPropertyOptional({ enum: ['OPERATIONAL', 'FAULT'] })
  @IsOptional()
  @IsIn(['OPERATIONAL', 'FAULT'])
  public readonly kind?: DeviceLogKind;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public readonly limit?: number;
}

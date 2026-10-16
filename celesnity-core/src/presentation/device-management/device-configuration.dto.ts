import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { DeviceType } from '@domain/device-management/models/device';

import type {
  DeviceConfigurationParameters,
  DiagnosticMetric,
  GatewayUplinkMode,
} from '@domain/device-management/models/device-configuration';

export class DeviceConfigurationParametersRequestDto implements DeviceConfigurationParameters {
  @ApiPropertyOptional({ minimum: 0.001, maximum: 100000, example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(100000)
  public readonly samplingRateHz?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 86400, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  public readonly reportingIntervalSeconds?: number;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'boolean' } })
  @IsOptional()
  @IsObject()
  public readonly channels?: Readonly<Record<string, boolean>>;

  @ApiPropertyOptional({ enum: ['MQTT', 'BULK_HTTP'] })
  @IsOptional()
  @IsIn(['MQTT', 'BULK_HTTP'])
  public readonly gatewayUplinkMode?: GatewayUplinkMode;

  @ApiPropertyOptional({
    enum: ['CPU_LOAD', 'CPU_TEMPERATURE', 'MEMORY', 'BATTERY_PERCENT', 'RSSI_SNR', 'UPTIME'],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(['CPU_LOAD', 'CPU_TEMPERATURE', 'MEMORY', 'BATTERY_PERCENT', 'RSSI_SNR', 'UPTIME'], {
    each: true,
  })
  public readonly diagnosticLogging?: readonly DiagnosticMetric[];

  @ApiPropertyOptional({ enum: ['ERROR', 'WARNING', 'INFO', 'DEBUG'] })
  @IsOptional()
  @IsIn(['ERROR', 'WARNING', 'INFO', 'DEBUG'])
  public readonly logLevel?: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'number' } })
  @IsOptional()
  @IsObject()
  public readonly alertThresholds?: Readonly<Record<string, number>>;
}

export class PushDeviceConfigurationRequestDto {
  @ApiPropertyOptional({ type: DeviceConfigurationParametersRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceConfigurationParametersRequestDto)
  public readonly parameters?: DeviceConfigurationParametersRequestDto;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  public readonly restoreFactoryDefaults?: boolean;
}

export class DeviceConfigurationEventRequestDto {
  @ApiProperty({ enum: ['APPLIED', 'FAILED', 'ROLLED_BACK'] })
  @IsIn(['APPLIED', 'FAILED', 'ROLLED_BACK'])
  public readonly status!: 'APPLIED' | 'FAILED' | 'ROLLED_BACK';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  public readonly error?: string;
}

export class CreateDeviceConfigurationTemplateRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name!: string;

  @ApiProperty({ type: DeviceConfigurationParametersRequestDto })
  @ValidateNested()
  @Type(() => DeviceConfigurationParametersRequestDto)
  public readonly parameters!: DeviceConfigurationParametersRequestDto;
}

export class DeployDeviceConfigurationTemplateRequestDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly deploymentSite?: string;

  @ApiPropertyOptional({ enum: ['GATEWAY', 'SENSOR'] })
  @IsOptional()
  @IsIn(['GATEWAY', 'SENSOR'])
  public readonly deviceType?: DeviceType;
}

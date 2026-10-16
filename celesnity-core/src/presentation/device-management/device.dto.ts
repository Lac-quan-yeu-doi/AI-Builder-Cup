import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class RegisterDeviceRequestDto {
  @ApiProperty()
  @IsUUID()
  public readonly adapterId!: string;

  @ApiProperty({ example: 'sensor-001' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
  public readonly externalDeviceId!: string;

  @ApiProperty({ enum: ['GATEWAY', 'SENSOR'] })
  @IsIn(['GATEWAY', 'SENSOR'])
  public readonly deviceType!: 'GATEWAY' | 'SENSOR';

  @ApiProperty({ example: 'Packaging temperature sensor' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name!: string;

  @ApiProperty({ example: 'Celesnity Edge Sensor' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly model!: string;

  @ApiPropertyOptional({ example: 'rev-b' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  public readonly hardwareRevision?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly currentFirmwareVersion?: string;

  @ApiPropertyOptional({ example: 'Factory 2' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly deploymentSite?: string;

  @ApiPropertyOptional({ example: 'Packaging line A / station 4' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  public readonly physicalLocation?: string;

  @ApiPropertyOptional({ description: 'Required when deviceType is SENSOR.' })
  @IsOptional()
  @IsUUID()
  public readonly gatewayId?: string;

  @ApiPropertyOptional({ example: 'packaging-line-a-temperature' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
  public readonly measurementPointKey?: string;

  @ApiPropertyOptional({ example: 'Packaging line A temperature' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly measurementPointName?: string;

  @ApiPropertyOptional({ default: 60, minimum: 1, maximum: 86400 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  public readonly expectedCheckInIntervalSeconds?: number;

  @ApiPropertyOptional({ default: 3, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly missedCheckInThreshold?: number;
}

export class UpdateDeviceRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  public readonly hardwareRevision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly currentFirmwareVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly deploymentSite?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  public readonly physicalLocation?: string;
}

export class ListDevicesQueryDto {
  @ApiProperty()
  @IsUUID()
  public readonly adapterId!: string;

  @ApiPropertyOptional({
    enum: ['PROVISIONING', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'FAILED', 'RETIRED'],
  })
  @IsOptional()
  @IsIn(['PROVISIONING', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'FAILED', 'RETIRED'])
  public readonly status?:
    'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'SUSPENDED' | 'FAILED' | 'RETIRED';

  @ApiPropertyOptional({ enum: ['GATEWAY', 'SENSOR'] })
  @IsOptional()
  @IsIn(['GATEWAY', 'SENSOR'])
  public readonly deviceType?: 'GATEWAY' | 'SENSOR';

  @ApiPropertyOptional({
    enum: ['MANUFACTURED', 'PROVISIONED', 'COMMISSIONED', 'DECOMMISSIONED'],
  })
  @IsOptional()
  @IsIn(['MANUFACTURED', 'PROVISIONED', 'COMMISSIONED', 'DECOMMISSIONED'])
  public readonly lifecycleState?:
    'MANUFACTURED' | 'PROVISIONED' | 'COMMISSIONED' | 'DECOMMISSIONED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  public readonly search?: string;
}

export class TransitionDeviceLifecycleRequestDto {
  @ApiProperty({
    enum: ['PROVISIONED', 'COMMISSIONED', 'DECOMMISSIONED'],
  })
  @IsIn(['PROVISIONED', 'COMMISSIONED', 'DECOMMISSIONED'])
  public readonly state!: 'PROVISIONED' | 'COMMISSIONED' | 'DECOMMISSIONED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  public readonly reason?: string;
}

export class DeviceCheckInRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  public readonly observedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly currentFirmwareVersion?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly configurationVersion?: number;

  @ApiPropertyOptional({ description: 'Required for sensor reports relayed by a gateway.' })
  @IsOptional()
  @IsUUID()
  public readonly reportingGatewayId?: string;
}

export class DeviceHeartbeatRequestDto extends DeviceCheckInRequestDto {
  @ApiProperty({
    description: 'Gateway UUID, or a sensor UUID bound to the authenticated gateway.',
  })
  @IsUUID()
  public readonly deviceId!: string;
}

export class DeviceAlertQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public readonly deviceId?: string;

  @ApiPropertyOptional({ enum: ['RAISED', 'ACKNOWLEDGED', 'CLEARED'] })
  @IsOptional()
  @IsIn(['RAISED', 'ACKNOWLEDGED', 'CLEARED'])
  public readonly status?: 'RAISED' | 'ACKNOWLEDGED' | 'CLEARED';
}

export const DEVICE_REPORTED_ALERT_TYPES = [
  'STORAGE_ALMOST_FULL',
  'SIM_DATA_LIMIT',
  'BATTERY_LOW',
  'TAMPER',
  'SHOCK',
  'MOVED',
  'SENSOR_FAULT',
  'UNEXPECTED_REBOOT',
  'RADIO_DEGRADED',
  'LTE_MODEM_FAILURE',
] as const;

export class DeviceAlertEventRequestDto {
  @ApiProperty({ description: 'Gateway UUID, or a sensor UUID bound to it.' })
  @IsUUID()
  public readonly deviceId!: string;

  @ApiProperty({ description: 'Stable event UUID used for offline replay idempotency.' })
  @IsUUID()
  public readonly eventId!: string;

  @ApiProperty({ enum: DEVICE_REPORTED_ALERT_TYPES })
  @IsIn(DEVICE_REPORTED_ALERT_TYPES)
  public readonly type!: (typeof DEVICE_REPORTED_ALERT_TYPES)[number];

  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  public readonly severity!: 'INFO' | 'WARNING' | 'CRITICAL';

  @ApiProperty({ description: 'Original device timestamp, retained during offline replay.' })
  @IsISO8601()
  public readonly observedAt!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  public readonly snapshot!: Readonly<Record<string, unknown>>;
}

export class ReplaceDeviceRequestDto {
  @ApiProperty({ example: 'sensor-002' })
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
  public readonly externalDeviceId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  public readonly name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly model!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  public readonly hardwareRevision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  public readonly currentFirmwareVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  public readonly reason?: string;
}

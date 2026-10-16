import { ApiProperty } from '@nestjs/swagger';

import type { DeviceLogEntry } from '@domain/device-management/models/device-log';

export class DeviceLogResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly deviceId!: string;
  @ApiProperty() public readonly deviceName!: string;
  @ApiProperty() public readonly sourceEventId!: string;
  @ApiProperty({ enum: ['ERROR', 'WARNING', 'INFO', 'DEBUG'] }) public readonly level!: string;
  @ApiProperty({ enum: ['OPERATIONAL', 'FAULT'] }) public readonly kind!: string;
  @ApiProperty() public readonly message!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly context!: Readonly<Record<string, unknown>>;
  @ApiProperty() public readonly observedAt!: string;
  @ApiProperty() public readonly receivedAt!: string;

  public static from(entry: DeviceLogEntry): DeviceLogResponseDto {
    return {
      id: entry.id,
      deviceId: entry.deviceId,
      deviceName: entry.deviceName,
      sourceEventId: entry.sourceEventId,
      level: entry.level,
      kind: entry.kind,
      message: entry.message,
      context: { ...entry.context },
      observedAt: entry.observedAt,
      receivedAt: entry.receivedAt,
    };
  }
}

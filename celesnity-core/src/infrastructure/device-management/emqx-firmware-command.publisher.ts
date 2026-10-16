import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IFirmwareCommandPublisher } from '@application/device-management/interfaces/i-firmware-command-publisher';
import type { Device } from '@domain/device-management/models/device';
import type { FirmwareCommand } from '@domain/device-management/models/firmware';

@Injectable()
export class EmqxFirmwareCommandPublisher implements IFirmwareCommandPublisher {
  private readonly endpoint: string;
  private readonly authorization: string;

  public constructor(config: ConfigService) {
    this.endpoint = config.getOrThrow<string>('EMQX_API_URL').replace(/\/$/u, '');
    this.authorization = `Basic ${Buffer.from(
      `${config.getOrThrow<string>('EMQX_API_KEY')}:${config.getOrThrow<string>('EMQX_API_SECRET')}`,
    ).toString('base64')}`;
  }

  public async publish(device: Device, command: FirmwareCommand): Promise<void> {
    const response = await fetch(`${this.endpoint}/publish`, {
      method: 'POST',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: device.topics.firmwareCommands,
        qos: device.qos,
        retain: false,
        payload_encoding: 'plain',
        payload: JSON.stringify({ type: 'firmware.install', ...command }),
      }),
    });
    if (!response.ok) {
      throw new Error(`EMQX firmware publish failed with status ${response.status}`);
    }
  }
}

export function firmwareCommandTopic(telemetryTopic: string): string {
  return replaceTelemetrySuffix(telemetryTopic, 'commands/firmware');
}

export function firmwareEventTopic(telemetryTopic: string): string {
  return replaceTelemetrySuffix(telemetryTopic, 'events/firmware');
}

function replaceTelemetrySuffix(telemetryTopic: string, suffix: string): string {
  if (!telemetryTopic.endsWith('/telemetry')) {
    throw new Error('Device telemetry topic does not use the expected suffix.');
  }
  return `${telemetryTopic.slice(0, -'/telemetry'.length)}/${suffix}`;
}

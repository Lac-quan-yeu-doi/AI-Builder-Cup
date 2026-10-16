import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IDeviceConfigurationCommandPublisher } from '@application/device-management/interfaces/i-device-configuration-command-publisher';
import type { Device } from '@domain/device-management/models/device';
import type { DeviceConfigurationCommand } from '@domain/device-management/models/device-configuration';

@Injectable()
export class EmqxDeviceConfigurationCommandPublisher implements IDeviceConfigurationCommandPublisher {
  private readonly endpoint: string;
  private readonly authorization: string;

  public constructor(config: ConfigService) {
    this.endpoint = config.getOrThrow<string>('EMQX_API_URL').replace(/\/$/u, '');
    this.authorization = `Basic ${Buffer.from(
      `${config.getOrThrow<string>('EMQX_API_KEY')}:${config.getOrThrow<string>('EMQX_API_SECRET')}`,
    ).toString('base64')}`;
  }

  public publish(device: Device, command: DeviceConfigurationCommand): Promise<void> {
    return this.publishRetained(
      device,
      JSON.stringify({ type: 'configuration.apply', ...command }),
    );
  }

  public clear(device: Device): Promise<void> {
    return this.publishRetained(device, '');
  }

  private async publishRetained(device: Device, payload: string): Promise<void> {
    const response = await fetch(`${this.endpoint}/publish`, {
      method: 'POST',
      headers: { Authorization: this.authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: configurationCommandTopic(device.topics.telemetry),
        qos: device.qos,
        retain: true,
        payload_encoding: 'plain',
        payload,
      }),
    });
    if (!response.ok) {
      throw new Error(`EMQX configuration publish failed with status ${response.status}`);
    }
  }
}

export function configurationCommandTopic(telemetryTopic: string): string {
  if (!telemetryTopic.endsWith('/telemetry')) {
    throw new Error('Device telemetry topic cannot be mapped to a configuration topic.');
  }
  return `${telemetryTopic.slice(0, -'/telemetry'.length)}/commands/configuration`;
}

export function configurationEventTopic(telemetryTopic: string): string {
  if (!telemetryTopic.endsWith('/telemetry')) {
    throw new Error('Device telemetry topic cannot be mapped to a configuration topic.');
  }
  return `${telemetryTopic.slice(0, -'/telemetry'.length)}/events/configuration`;
}

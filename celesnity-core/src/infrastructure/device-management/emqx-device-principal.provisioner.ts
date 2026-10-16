import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IDevicePrincipalProvisioner } from '@application/device-management/interfaces/i-device-principal-provisioner';
import type { DeviceRecord } from '@domain/device-management/models/device';
import {
  configurationCommandTopic,
  configurationEventTopic,
} from '@infrastructure/device-management/emqx-device-configuration-command.publisher';
import {
  firmwareCommandTopic,
  firmwareEventTopic,
} from '@infrastructure/device-management/emqx-firmware-command.publisher';

const AUTHENTICATOR = 'password_based%3Abuilt_in_database';

@Injectable()
export class EmqxDevicePrincipalProvisioner implements IDevicePrincipalProvisioner {
  private readonly endpoint: string;
  private readonly authorization: string;

  public constructor(config: ConfigService) {
    this.endpoint = config.getOrThrow<string>('EMQX_API_URL').replace(/\/$/u, '');
    this.authorization = `Basic ${Buffer.from(
      `${config.getOrThrow<string>('EMQX_API_KEY')}:${config.getOrThrow<string>('EMQX_API_SECRET')}`,
    ).toString('base64')}`;
  }

  public async apply(
    device: DeviceRecord,
    credentials: Readonly<Record<string, string>>,
    authorizedTelemetryTopics: readonly string[],
  ): Promise<void> {
    const username = requiredCredential(credentials, 'username');
    if (username !== device.publicKey) {
      throw new Error('Stored MQTT principal does not match device.');
    }
    if (device.desiredState !== 'ACTIVE' || device.deviceType === 'SENSOR') {
      await this.remove(username);
      return;
    }
    await this.upsertUser(username, requiredCredential(credentials, 'password'));
    await this.upsertAuthorization(device, authorizedTelemetryTopics);
  }

  private async upsertUser(username: string, password: string): Promise<void> {
    const collection = `/authentication/${AUTHENTICATOR}/users`;
    const create = await this.request(collection, 'POST', {
      user_id: username,
      password,
      is_superuser: false,
    });
    if (create.ok) return;
    if (create.status !== 409) await provisioningFailure(create, 'create device principal');
    const update = await this.request(`${collection}/${encodeURIComponent(username)}`, 'PUT', {
      password,
      is_superuser: false,
    });
    if (!update.ok) await provisioningFailure(update, 'update device principal');
  }

  private async upsertAuthorization(
    device: DeviceRecord,
    authorizedTelemetryTopics: readonly string[],
  ): Promise<void> {
    const collection = '/authorization/sources/built_in_database/rules/users';
    const rule = {
      username: device.publicKey,
      rules: [
        ...uniqueTopics(authorizedTelemetryTopics).map((topic) => ({
          topic,
          permission: 'allow',
          action: 'publish',
          qos: [device.qos],
          retain: false,
        })),
        ...uniqueTopics(authorizedTelemetryTopics).flatMap((topic) => [
          {
            topic: configurationEventTopic(topic),
            permission: 'allow',
            action: 'publish',
            qos: [device.qos],
            retain: false,
          },
          {
            topic: configurationCommandTopic(topic),
            permission: 'allow',
            action: 'subscribe',
            qos: [device.qos],
          },
        ]),
        ...uniqueTopics(authorizedTelemetryTopics).flatMap((topic) => [
          {
            topic: firmwareEventTopic(topic),
            permission: 'allow',
            action: 'publish',
            qos: [device.qos],
            retain: false,
          },
          {
            topic: firmwareCommandTopic(topic),
            permission: 'allow',
            action: 'subscribe',
            qos: [device.qos],
          },
        ]),
        { topic: '#', permission: 'deny', action: 'all' },
      ],
    };
    const update = await this.request(
      `${collection}/${encodeURIComponent(device.publicKey)}`,
      'PUT',
      rule,
    );
    if (update.ok) return;
    if (update.status !== 404) await provisioningFailure(update, 'update device authorization');
    const create = await this.request(collection, 'POST', [rule]);
    if (!create.ok) await provisioningFailure(create, 'create device authorization');
  }

  private async remove(username: string): Promise<void> {
    const responses = await Promise.all([
      this.request(
        `/authentication/${AUTHENTICATOR}/users/${encodeURIComponent(username)}`,
        'DELETE',
      ),
      this.request(
        `/authorization/sources/built_in_database/rules/users/${encodeURIComponent(username)}`,
        'DELETE',
      ),
    ]);
    for (const response of responses) {
      if (!response.ok && response.status !== 404) {
        await provisioningFailure(response, 'revoke device principal');
      }
    }
  }

  private request(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${this.endpoint}${path}`, {
      method,
      headers: {
        authorization: this.authorization,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
  }
}

function uniqueTopics(topics: readonly string[]): readonly string[] {
  return [...new Set(topics.filter((topic) => topic.length > 0))];
}

function requiredCredential(credentials: Readonly<Record<string, string>>, name: string): string {
  const value = credentials[name];
  if (value === undefined || value === '') throw new Error(`Stored device ${name} is missing.`);
  return value;
}

async function provisioningFailure(response: Response, action: string): Promise<never> {
  await response.body?.cancel();
  throw new Error(`EMQX could not ${action} (HTTP ${response.status}).`);
}

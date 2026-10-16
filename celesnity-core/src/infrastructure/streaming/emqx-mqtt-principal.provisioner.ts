import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IStreamingProvisioner } from '@application/streaming/interfaces/i-streaming-provisioner';
import type { MqttStreamAdapterRecord } from '@domain/streaming/models/mqtt-stream-adapter';

const AUTHENTICATOR = 'password_based%3Abuilt_in_database';

@Injectable()
export class EmqxMqttPrincipalProvisioner implements IStreamingProvisioner {
  private readonly endpoint: string;
  private readonly authorization: string;

  public constructor(config: ConfigService) {
    this.endpoint = config.getOrThrow<string>('EMQX_API_URL').replace(/\/$/u, '');
    this.authorization = `Basic ${Buffer.from(
      `${config.getOrThrow<string>('EMQX_API_KEY')}:${config.getOrThrow<string>('EMQX_API_SECRET')}`,
    ).toString('base64')}`;
  }

  public async apply(
    adapter: MqttStreamAdapterRecord,
    credentials: Readonly<Record<string, string>>,
  ): Promise<void> {
    const username = requiredCredential(credentials, 'username');
    if (username !== adapter.publicKey)
      throw new Error('Stored MQTT principal does not match adapter.');

    if (adapter.desiredState !== 'ACTIVE') {
      await this.remove(username);
      return;
    }

    const password = requiredCredential(credentials, 'password');
    await this.upsertUser(username, password);
    await this.upsertAuthorization(username, adapter.topicFilter, adapter.qos);
  }

  private async upsertUser(username: string, password: string): Promise<void> {
    const collection = `/authentication/${AUTHENTICATOR}/users`;
    const create = await this.request(collection, 'POST', {
      user_id: username,
      password,
      is_superuser: false,
    });
    if (create.ok) return;
    if (create.status !== 409) await provisioningFailure(create, 'create MQTT principal');

    const update = await this.request(`${collection}/${encodeURIComponent(username)}`, 'PUT', {
      password,
      is_superuser: false,
    });
    if (!update.ok) await provisioningFailure(update, 'update MQTT principal');
  }

  private async upsertAuthorization(username: string, topic: string, qos: number): Promise<void> {
    const collection = '/authorization/sources/built_in_database/rules/users';
    const rule = {
      username,
      rules: [
        { topic, permission: 'allow', action: 'publish', qos: [qos], retain: 'all' },
        { topic: '#', permission: 'deny', action: 'all' },
      ],
    };
    const update = await this.request(`${collection}/${encodeURIComponent(username)}`, 'PUT', rule);
    if (update.ok) return;
    if (update.status !== 404) await provisioningFailure(update, 'update MQTT authorization');
    const create = await this.request(collection, 'POST', [rule]);
    if (!create.ok) await provisioningFailure(create, 'create MQTT authorization');
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
        await provisioningFailure(response, 'revoke MQTT principal');
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

function requiredCredential(credentials: Readonly<Record<string, string>>, name: string): string {
  const value = credentials[name];
  if (value === undefined || value === '') throw new Error(`Stored MQTT ${name} is missing.`);
  return value;
}

async function provisioningFailure(response: Response, action: string): Promise<never> {
  await response.body?.cancel();
  throw new Error(`EMQX could not ${action} (HTTP ${response.status}).`);
}

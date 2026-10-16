import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IFtpsStatusReader } from '@application/ftps-connector/interfaces/i-ftps-status-reader';
import type {
  FtpsActiveConnectionView,
  FtpsStatusProbeResult,
} from '@application/ftps-connector/read-models/ftps-connector.view';

interface SftpGoConnectionStatus {
  readonly username?: unknown;
  readonly protocol?: unknown;
  readonly connection_id?: unknown;
  readonly remote_address?: unknown;
  readonly connection_time?: unknown;
  readonly last_activity?: unknown;
}

@Injectable()
export class SftpGoFtpsStatusReader implements IFtpsStatusReader {
  private readonly endpoint: string;
  private readonly authorization: string;
  private readonly timeoutMilliseconds: number;

  public constructor(config: ConfigService) {
    this.endpoint = config.getOrThrow<string>('FTPS_SFTPGO_API_URL').replace(/\/$/u, '');
    this.authorization = `Basic ${Buffer.from(
      `${config.getOrThrow<string>('FTPS_STATUS_USERNAME')}:${config.getOrThrow<string>('FTPS_STATUS_PASSWORD')}`,
    ).toString('base64')}`;
    this.timeoutMilliseconds = config.getOrThrow<number>('FTPS_STATUS_TIMEOUT_MS');
  }

  public async read(username: string): Promise<FtpsStatusProbeResult> {
    try {
      const token = await this.authenticate();
      const response = await this.request('/connections', {
        Authorization: `Bearer ${token}`,
      });
      if (response.status === 401 || response.status === 403) {
        return failure(username, 'STATUS_AUTHENTICATION_FAILED');
      }
      if (!response.ok) return failure(username, 'STATUS_SERVICE_UNAVAILABLE');

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return failure(username, 'STATUS_RESPONSE_INVALID');
      }
      if (!Array.isArray(payload)) return failure(username, 'STATUS_RESPONSE_INVALID');

      const matches = payload
        .filter(isConnectionStatus)
        .filter((connection) => connection.username === username && connection.protocol === 'FTP');
      if (matches.length === 0) return failure(username, 'NO_ACTIVE_CONNECTION');
      const [firstMatch] = matches;
      if (firstMatch === undefined) return failure(username, 'NO_ACTIVE_CONNECTION');

      return {
        status: 'Success',
        username,
        activeConnectionCount: matches.length,
        connection: toActiveConnection(firstMatch),
      };
    } catch (error: unknown) {
      if (error instanceof StatusAuthenticationError) {
        return failure(username, 'STATUS_AUTHENTICATION_FAILED');
      }
      if (error instanceof StatusResponseError) {
        return failure(username, 'STATUS_RESPONSE_INVALID');
      }
      return failure(username, 'STATUS_SERVICE_UNAVAILABLE');
    }
  }

  private async authenticate(): Promise<string> {
    const response = await this.request('/token', {
      Authorization: this.authorization,
    });
    if (response.status === 401 || response.status === 403) {
      throw new StatusAuthenticationError();
    }
    if (!response.ok) throw new StatusServiceError();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new StatusResponseError();
    }
    if (
      !isRecord(payload) ||
      typeof payload.access_token !== 'string' ||
      payload.access_token === ''
    ) {
      throw new StatusResponseError();
    }
    return payload.access_token;
  }

  private request(path: string, headers: Record<string, string>): Promise<Response> {
    return fetch(`${this.endpoint}/api/v2${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal: AbortSignal.timeout(this.timeoutMilliseconds),
    });
  }
}

class StatusAuthenticationError extends Error {}
class StatusResponseError extends Error {}
class StatusServiceError extends Error {}

function failure(
  username: string,
  reason: NonNullable<FtpsStatusProbeResult['reason']>,
): FtpsStatusProbeResult {
  return {
    status: 'Fail',
    username,
    activeConnectionCount: 0,
    reason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConnectionStatus(value: unknown): value is SftpGoConnectionStatus {
  return isRecord(value);
}

function toActiveConnection(connection: SftpGoConnectionStatus): FtpsActiveConnectionView {
  return {
    connectionId:
      typeof connection.connection_id === 'string' ? connection.connection_id : 'unknown',
    ...(typeof connection.remote_address === 'string'
      ? { remoteAddress: connection.remote_address }
      : {}),
    ...(toIsoTimestamp(connection.connection_time) === undefined
      ? {}
      : { connectedAt: toIsoTimestamp(connection.connection_time) }),
    ...(toIsoTimestamp(connection.last_activity) === undefined
      ? {}
      : { lastActivityAt: toIsoTimestamp(connection.last_activity) }),
  };
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

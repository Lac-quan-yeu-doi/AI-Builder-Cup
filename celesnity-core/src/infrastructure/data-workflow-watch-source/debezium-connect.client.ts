import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DebeziumConnectorView {
  readonly name: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly type?: string;
  readonly state?: string;
}

export interface DebeziumConnectorStatusView {
  readonly name: string;
  readonly connectorState: string;
  readonly taskStates: readonly string[];
}

export class DebeziumConnectError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code:
      'CONNECT_UNAVAILABLE' | 'CONNECT_REQUEST_FAILED' | 'CONNECT_RESPONSE_INVALID',
  ) {
    super(code);
  }
}

@Injectable()
export class DebeziumConnectClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  public constructor(config: ConfigService) {
    this.endpoint = config
      .get<string>('DEBEZIUM_CONNECT_URL', 'http://127.0.0.1:18083')
      .replace(/\/$/u, '');
    this.timeoutMs = config.get<number>('DEBEZIUM_CONNECT_TIMEOUT_MS', 5_000);
  }

  public async get(name: string): Promise<DebeziumConnectorView | undefined> {
    const response = await this.request(`/connectors/${encodeURIComponent(name)}`, {}, true);
    if (response.status === 404) return undefined;
    return this.parse<DebeziumConnectorView>(response, 'CONNECT_RESPONSE_INVALID');
  }

  public async getStatus(name: string): Promise<DebeziumConnectorStatusView | undefined> {
    const response = await this.request(
      `/connectors/${encodeURIComponent(name)}/status`,
      {},
      true,
    );
    if (response.status === 404) return undefined;
    const payload = await this.parse<unknown>(response, 'CONNECT_RESPONSE_INVALID');
    if (!isRecord(payload) || typeof payload.name !== 'string' || !isRecord(payload.connector)) {
      throw new DebeziumConnectError(response.status, 'CONNECT_RESPONSE_INVALID');
    }
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const taskStates = tasks.map((task) => {
      if (!isRecord(task) || typeof task.state !== 'string') {
        throw new DebeziumConnectError(response.status, 'CONNECT_RESPONSE_INVALID');
      }
      return task.state;
    });
    if (typeof payload.connector.state !== 'string') {
      throw new DebeziumConnectError(response.status, 'CONNECT_RESPONSE_INVALID');
    }
    return {
      name: payload.name,
      connectorState: payload.connector.state,
      taskStates,
    };
  }

  /** Probes the Connect REST boundary without requiring a connector to exist. */
  public async checkHealth(): Promise<void> {
    await this.request('/connectors');
  }

  public async create(name: string, config: Readonly<Record<string, string>>): Promise<void> {
    await this.request('/connectors', {
      method: 'POST',
      body: JSON.stringify({ name, config }),
      headers: { 'content-type': 'application/json' },
    });
  }

  public async update(name: string, config: Readonly<Record<string, string>>): Promise<void> {
    await this.request(`/connectors/${encodeURIComponent(name)}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
      headers: { 'content-type': 'application/json' },
    });
  }

  public async pause(name: string): Promise<void> {
    await this.request(`/connectors/${encodeURIComponent(name)}/pause`, { method: 'PUT' });
  }

  public async resume(name: string): Promise<void> {
    await this.request(`/connectors/${encodeURIComponent(name)}/resume`, { method: 'PUT' });
  }

  private async request(
    path: string,
    init: RequestInit = {},
    allowNotFound = false,
  ): Promise<Response> {
    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok && !(allowNotFound && response.status === 404)) {
        throw new DebeziumConnectError(response.status, 'CONNECT_REQUEST_FAILED');
      }
      return response;
    } catch (error: unknown) {
      if (error instanceof DebeziumConnectError) throw error;
      throw new DebeziumConnectError(503, 'CONNECT_UNAVAILABLE');
    }
  }

  private async parse<T>(response: Response, code: DebeziumConnectError['code']): Promise<T> {
    try {
      const payload: unknown = await response.json();
      if (payload === null || typeof payload !== 'object') {
        throw new Error('invalid response');
      }
      return payload as T;
    } catch {
      throw new DebeziumConnectError(response.status, code);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

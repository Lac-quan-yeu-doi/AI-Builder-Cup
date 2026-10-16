import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';
import {
  type ConnectionDetailsInput,
  type ConnectionVerificationResult,
  type DataConnection,
  type DataConnectionInput,
} from '@/src/entities/models/connection';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import {
  fromConnectionResponse,
  fromVerificationResponse,
  toCreateConnectionRequest,
  toTestConnectionRequest,
  toUpdateConnectionRequest,
} from '@/src/infrastructure/repositories/connection-api.mapper';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type DataConnectionResponseDto = components['schemas']['DatabaseServiceResponseDto'];
type ConnectionVerificationResponseDto = components['schemas']['ConnectionVerificationResponseDto'];

export class CoreApiConnectionRepository implements ConnectionRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly DataConnection[]> {
    const response = await this.request<components['schemas']['DatabaseServiceListResponseDto']>(
      '/database-services',
      {
        method: 'GET',
      },
    );
    return response.items.map(fromConnectionResponse);
  }

  public async get(id: string): Promise<DataConnection> {
    const response = await this.request<DataConnectionResponseDto>(databaseServicePath(id), {
      method: 'GET',
    });
    return fromConnectionResponse(response);
  }

  public async testUnsaved(details: ConnectionDetailsInput): Promise<ConnectionVerificationResult> {
    const response = await this.request<ConnectionVerificationResponseDto>(
      '/database-service-tests',
      {
        method: 'POST',
        body: JSON.stringify(toTestConnectionRequest(details)),
      },
    );
    return fromVerificationResponse(response);
  }

  public async testSaved(id: string): Promise<ConnectionVerificationResult> {
    const response = await this.request<ConnectionVerificationResponseDto>(
      `${databaseServicePath(id)}/test`,
      { method: 'POST' },
    );
    return fromVerificationResponse(response);
  }

  public async create(input: DataConnectionInput): Promise<DataConnection> {
    const response = await this.request<DataConnectionResponseDto>('/database-services', {
      method: 'POST',
      body: JSON.stringify(toCreateConnectionRequest(input)),
    });
    return fromConnectionResponse(response);
  }

  public async update(id: string, input: DataConnectionInput): Promise<DataConnection> {
    const response = await this.request<DataConnectionResponseDto>(databaseServicePath(id), {
      method: 'PATCH',
      body: JSON.stringify(toUpdateConnectionRequest(input)),
    });
    return fromConnectionResponse(response);
  }

  public archive(id: string): Promise<void> {
    return this.request<void>(databaseServicePath(id), { method: 'DELETE' });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function databaseServicePath(id: string): string {
  return `/database-services/${encodeURIComponent(id)}`;
}

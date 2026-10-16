import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type {
  DatabaseService,
  DatabaseServiceConnectorDescriptor,
  DatabaseServiceDetailsInput,
  DatabaseServiceInput,
  DatabaseServiceListPage,
  DatabaseServiceListQuery,
  DatabaseServiceUpdateInput,
  DatabaseServiceVerificationResult,
  CdcConnectionProfile,
  CdcConnectionProfileInput,
} from '@/src/entities/models/database-service';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import {
  fromConnectorDescriptorResponse,
  fromDatabaseServiceListResponse,
  fromDatabaseServiceResponse,
  fromVerificationResponse,
  toCreateDatabaseServiceRequest,
  toTestDatabaseServiceRequest,
  toUpdateDatabaseServiceRequest,
  type DatabaseServiceListResponseDto,
  type DatabaseServiceResponseDto,
  type DatabaseServiceVerificationResponseDto,
  type CdcConnectionProfileResponseDto,
  fromCdcConnectionProfileResponse,
  toPutCdcConnectionProfileRequest,
} from '@/src/infrastructure/repositories/database-service-api.mapper';

export class CoreApiDatabaseServiceRepository implements DatabaseServiceRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(query?: DatabaseServiceListQuery): Promise<DatabaseServiceListPage> {
    const response = await this.request<DatabaseServiceListResponseDto>(
      `/database-services${encodeListQuery(query)}`,
      { method: 'GET' },
    );
    return fromDatabaseServiceListResponse(response);
  }

  public async listAvailable(
    query: DatabaseServiceListQuery & { readonly databaseName: string },
  ): Promise<DatabaseServiceListPage> {
    const response = await this.request<DatabaseServiceListResponseDto>(
      `/database-services/available${encodeListQuery(query)}`,
      { method: 'GET' },
    );
    return fromDatabaseServiceListResponse(response);
  }

  public async get(id: string): Promise<DatabaseService> {
    const response = await this.request<DatabaseServiceResponseDto>(databaseServicePath(id), {
      method: 'GET',
    });
    return fromDatabaseServiceResponse(response);
  }

  public async listConnectorDescriptors(): Promise<readonly DatabaseServiceConnectorDescriptor[]> {
    const response = await this.request<readonly DatabaseServiceConnectorDescriptor[]>(
      '/database-service-connectors',
      { method: 'GET' },
    );
    return response.map(fromConnectorDescriptorResponse);
  }

  public async testUnsaved(
    connectorType: string,
    details: DatabaseServiceDetailsInput,
  ): Promise<DatabaseServiceVerificationResult> {
    const response = await this.request<DatabaseServiceVerificationResponseDto>(
      '/database-service-tests',
      {
        method: 'POST',
        body: JSON.stringify(toTestDatabaseServiceRequest(connectorType, details)),
      },
    );
    return fromVerificationResponse(response);
  }

  public async testSaved(id: string): Promise<DatabaseServiceVerificationResult> {
    const response = await this.request<DatabaseServiceVerificationResponseDto>(
      `${databaseServicePath(id)}/test`,
      { method: 'POST' },
    );
    return fromVerificationResponse(response);
  }

  public async create(input: DatabaseServiceInput): Promise<DatabaseService> {
    const response = await this.request<DatabaseServiceResponseDto>('/database-services', {
      method: 'POST',
      body: JSON.stringify(toCreateDatabaseServiceRequest(input)),
    });
    return fromDatabaseServiceResponse(response);
  }

  public async update(id: string, input: DatabaseServiceUpdateInput): Promise<DatabaseService> {
    const response = await this.request<DatabaseServiceResponseDto>(databaseServicePath(id), {
      method: 'PATCH',
      body: JSON.stringify(toUpdateDatabaseServiceRequest(input)),
    });
    return fromDatabaseServiceResponse(response);
  }

  public archive(id: string): Promise<void> {
    return this.request<void>(databaseServicePath(id), { method: 'DELETE' });
  }

  public attach(id: string, databaseName: string): Promise<void> {
    return this.request<void>(membershipPath(id, databaseName), { method: 'PUT' });
  }

  public detach(id: string, databaseName: string): Promise<void> {
    return this.request<void>(membershipPath(id, databaseName), { method: 'DELETE' });
  }

  public async getCdcConnection(id: string): Promise<CdcConnectionProfile> {
    const response = await this.request<CdcConnectionProfileResponseDto>(cdcConnectionPath(id), {
      method: 'GET',
    });
    return fromCdcConnectionProfileResponse(response);
  }

  public async saveCdcConnection(
    id: string,
    input: CdcConnectionProfileInput,
  ): Promise<CdcConnectionProfile> {
    const response = await this.request<CdcConnectionProfileResponseDto>(cdcConnectionPath(id), {
      method: 'PUT',
      body: JSON.stringify(toPutCdcConnectionProfileRequest(input)),
    });
    return fromCdcConnectionProfileResponse(response);
  }

  public async validateCdcConnection(id: string): Promise<CdcConnectionProfile> {
    const response = await this.request<CdcConnectionProfileResponseDto>(
      `${cdcConnectionPath(id)}/validate`,
      { method: 'POST' },
    );
    return fromCdcConnectionProfileResponse(response);
  }

  public removeCdcConnection(id: string): Promise<void> {
    return this.request<void>(cdcConnectionPath(id), { method: 'DELETE' });
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

function cdcConnectionPath(id: string): string {
  return `${databaseServicePath(id)}/cdc-connection`;
}

function membershipPath(id: string, databaseName: string): string {
  return `${databaseServicePath(id)}/memberships/${encodeURIComponent(databaseName)}`;
}

export function encodeListQuery(query?: DatabaseServiceListQuery): string {
  if (!query) return '';
  const params = new URLSearchParams();
  const values: Record<string, string | number | undefined> = {
    search: query.search,
    databaseName: query.databaseName,
    connectorType: query.connectorType,
    verificationStatus: query.verificationStatus,
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

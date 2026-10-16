import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import type {
  ActiveConnectionOption,
  PublishedScriptSource,
  RunScriptResult,
  Script,
  ScriptMetadata,
  ScriptVersion,
} from '@/src/entities/models/script';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type CreateScriptRequestDto = components['schemas']['CreateScriptRequestDto'];
type UpdateScriptRequestDto = components['schemas']['UpdateScriptRequestDto'];
type PublishScriptVersionRequestDto = components['schemas']['PublishScriptVersionRequestDto'];
type ScriptResponseDto = components['schemas']['ScriptResponseDto'];
type ScriptVersionResponseDto = components['schemas']['ScriptVersionResponseDto'];
type ScriptSourceResponseDto = components['schemas']['ScriptSourceResponseDto'];
interface DatabaseServiceListResponse {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly connectorType: string;
  }[];
}

interface DatabaseServiceConnectorDescriptorResponse {
  readonly connectorType: string;
  readonly label: string;
}

interface ScriptVersionExecutionResponseShape {
  readonly id?: unknown;
  readonly executionId?: unknown;
  readonly status?: unknown;
}

export class CoreApiScriptRepository implements ScriptRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listScripts(): Promise<readonly Script[]> {
    const response = await this.request<ScriptResponseDto[]>('/scripts', { method: 'GET' });
    return response.map(mapScript);
  }

  public async getScript(id: string): Promise<Script> {
    const response = await this.request<ScriptResponseDto>(scriptPath(id), { method: 'GET' });
    return mapScript(response);
  }

  public async createScript(metadata: ScriptMetadata): Promise<Script> {
    const request: CreateScriptRequestDto = {
      name: metadata.name,
      connectionId: metadata.connectionId,
      ...(metadata.description ? { description: metadata.description } : {}),
    };
    const response = await this.request<ScriptResponseDto>('/scripts', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return mapScript(response);
  }

  public async updateScriptMetadata(id: string, metadata: ScriptMetadata): Promise<Script> {
    const request: UpdateScriptRequestDto = {
      name: metadata.name,
      connectionId: metadata.connectionId,
      description: (metadata.description ?? null) as UpdateScriptRequestDto['description'],
    };
    const response = await this.request<ScriptResponseDto>(scriptPath(id), {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    return mapScript(response);
  }

  public async publishVersion(scriptId: string, source: string): Promise<ScriptVersion> {
    const request: PublishScriptVersionRequestDto = { source };
    const response = await this.request<ScriptVersionResponseDto>(
      `${scriptPath(scriptId)}/versions`,
      { method: 'POST', body: JSON.stringify(request) },
    );
    return mapVersion(response);
  }

  public async listVersions(scriptId: string): Promise<readonly ScriptVersion[]> {
    const response = await this.request<ScriptVersionResponseDto[]>(
      `${scriptPath(scriptId)}/versions`,
      { method: 'GET' },
    );
    return response.map(mapVersion);
  }

  public async loadVersionSource(
    scriptId: string,
    versionNumber: number,
  ): Promise<PublishedScriptSource> {
    const response = await this.request<ScriptSourceResponseDto>(
      `${scriptPath(scriptId)}/versions/${encodeURIComponent(String(versionNumber))}/source`,
      { method: 'GET' },
    );
    return { version: mapVersion(response), source: response.source };
  }

  public async listActiveConnections(): Promise<readonly ActiveConnectionOption[]> {
    const [response, descriptors] = await Promise.all([
      this.request<DatabaseServiceListResponse>(
        '/database-services?verificationStatus=SUCCEEDED&page=1&pageSize=500&sortBy=name&sortDirection=asc',
        { method: 'GET' },
      ),
      this.request<readonly DatabaseServiceConnectorDescriptorResponse[]>(
        '/database-service-connectors',
        { method: 'GET' },
      ),
    ]);
    const labelsByConnectorType = new Map(
      descriptors.map((descriptor) => [descriptor.connectorType, descriptor.label]),
    );

    return response.items.map((connection) => ({
      id: connection.id,
      name: connection.name,
      connectorType: connection.connectorType,
      connectorLabel:
        labelsByConnectorType.get(connection.connectorType) ?? connection.connectorType,
    }));
  }

  public async runVersion(scriptId: string, versionNumber: number): Promise<RunScriptResult> {
    let response: unknown;

    try {
      response = await this.transport.request<unknown>(
        `${scriptPath(scriptId)}/versions/${encodeURIComponent(String(versionNumber))}/executions`,
        { method: 'POST' },
      );
    } catch (error) {
      if (error instanceof CoreApiError && error.status === 404) {
        return { scriptId, versionNumber, outcome: 'execution-service-unavailable' };
      }
      throw translateCoreApiError(error);
    }

    return mapExecutionResponse(response, scriptId, versionNumber);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function scriptPath(id: string): string {
  return `/scripts/${encodeURIComponent(id)}`;
}

function mapScript(dto: ScriptResponseDto): Script {
  return {
    id: dto.id,
    name: dto.name,
    connectionId: dto.connectionId,
    status: 'active',
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    ...(dto.description ? { description: dto.description } : {}),
    ...(dto.currentVersion ? { currentVersion: mapVersion(dto.currentVersion) } : {}),
  };
}

function mapVersion(dto: ScriptVersionResponseDto): ScriptVersion {
  return {
    id: dto.id,
    scriptId: dto.scriptId,
    versionNumber: dto.versionNumber,
    artifactBucket: dto.artifactBucket,
    objectKey: dto.objectKey,
    contentSha256: dto.contentSha256,
    contentSize: dto.contentSize,
    publishedAt: dto.publishedAt,
  };
}

function mapExecutionResponse(
  response: unknown,
  scriptId: string,
  versionNumber: number,
): RunScriptResult {
  if (!isRecord(response)) {
    throw new Error('The Core API returned an invalid execution response.');
  }

  const transport: ScriptVersionExecutionResponseShape = response;
  const executionId = transport.executionId ?? transport.id;
  if (executionId !== undefined && typeof executionId !== 'string') {
    throw new Error('The Core API returned an invalid execution identifier.');
  }
  if (transport.status !== undefined && typeof transport.status !== 'string') {
    throw new Error('The Core API returned an invalid execution status.');
  }

  return {
    scriptId,
    versionNumber,
    outcome: 'accepted',
    ...(executionId ? { executionId } : {}),
    ...(transport.status ? { status: transport.status } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

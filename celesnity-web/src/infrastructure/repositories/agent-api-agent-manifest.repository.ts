import type { AgentManifestRepository } from '@/src/application/repositories/agent-manifest.repository.interface';
import type {
  AgentManifest,
  AgentManifestSummary,
  SaveAgentManifestInput,
} from '@/src/entities/models/agent-manifest';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface AgentManifestSummaryDto {
  name: string;
  description: string;
  skills?: readonly unknown[] | null;
  source_path: string;
  content_hash: string;
  yaml: string;
}

export class AgentApiAgentManifestRepository implements AgentManifestRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly AgentManifestSummary[]> {
    const dtos = await this.request<AgentManifestSummaryDto[]>('/agent-manifests', {
      method: 'GET',
    });
    return dtos.map(mapManifest);
  }

  public async get(name: string): Promise<AgentManifest> {
    return mapManifest(
      await this.request<AgentManifestSummaryDto>(manifestPath(name), { method: 'GET' }),
    );
  }

  public async validate(yaml: string): Promise<AgentManifest> {
    return mapManifest(
      await this.request<AgentManifestSummaryDto>('/agent-manifests/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml }),
      }),
    );
  }

  public async save(input: SaveAgentManifestInput): Promise<AgentManifest> {
    return mapManifest(
      await this.request<AgentManifestSummaryDto>(manifestPath(input.name), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml: input.yaml }),
      }),
    );
  }

  public async delete(name: string): Promise<void> {
    await this.request<void>(manifestPath(name), { method: 'DELETE' });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapManifest(dto: AgentManifestSummaryDto): AgentManifest {
  return {
    name: dto.name,
    description: dto.description,
    skills: Array.isArray(dto.skills)
      ? dto.skills.filter((skill): skill is string => typeof skill === 'string')
      : [],
    sourcePath: dto.source_path,
    contentHash: dto.content_hash,
    yaml: dto.yaml,
  };
}

function manifestPath(name: string): string {
  return `/agent-manifests/${encodeURIComponent(name)}`;
}

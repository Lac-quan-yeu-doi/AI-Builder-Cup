import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';
import type {
  CreateSkillInput,
  SkillDetail,
  SkillSummary,
  UpdateSkillInput,
} from '@/src/entities/models/skill';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface SkillSummaryDto {
  name: string;
  description: string;
  namespace: string;
  source: 'project' | 'global';
}

interface SkillDetailDto extends SkillSummaryDto {
  body: string;
}

export class AgentApiSkillRepository implements SkillRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly SkillSummary[]> {
    const dtos = await this.request<SkillSummaryDto[]>('/skills', { method: 'GET' });
    return dtos.map(mapSummary);
  }

  public async get(name: string): Promise<SkillDetail> {
    const dto = await this.request<SkillDetailDto>(skillPath(name), { method: 'GET' });
    return mapDetail(dto);
  }

  public async create(input: CreateSkillInput): Promise<SkillDetail> {
    return mapDetail(
      await this.request<SkillDetailDto>('/skills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  }

  public async update(input: UpdateSkillInput): Promise<SkillDetail> {
    const { name, description, namespace, body } = input;
    return mapDetail(
      await this.request<SkillDetailDto>(skillPath(name), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description, namespace, body }),
      }),
    );
  }

  public async delete(name: string): Promise<void> {
    await this.request<void>(skillPath(name), { method: 'DELETE' });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function skillPath(name: string): string {
  return `/skills/${encodeURIComponent(name)}`;
}

function mapSummary(dto: SkillSummaryDto): SkillSummary {
  return {
    name: dto.name,
    description: dto.description,
    namespace: dto.namespace,
    source: dto.source,
  };
}

function mapDetail(dto: SkillDetailDto): SkillDetail {
  return {
    ...mapSummary(dto),
    body: dto.body,
  };
}

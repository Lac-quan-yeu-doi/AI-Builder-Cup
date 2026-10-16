import type { CitationRepository } from '@/src/application/repositories/citation.repository.interface';
import type { CitationRef, CitationType, ResolvedCitation } from '@/src/entities/models/citation';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface ResolvedCitationDto {
  type: string;
  id: string;
  found: boolean;
  title: string | null;
  page?: number;
}

export class CoreApiCitationRepository implements CitationRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async resolve(refs: readonly CitationRef[]): Promise<readonly ResolvedCitation[]> {
    if (refs.length === 0) return [];
    const response = await this.request<ResolvedCitationDto[]>('/citations/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ citations: refs }),
    });
    return response.map(mapResolvedCitation);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapResolvedCitation(dto: ResolvedCitationDto): ResolvedCitation {
  const type: CitationType = dto.type === 'document' ? 'document' : 'chart';
  return {
    type,
    id: dto.id,
    found: dto.found,
    title: dto.title,
    ...(dto.page === undefined ? {} : { page: dto.page }),
  };
}

import type { PendingActionRepository } from '@/src/application/repositories/pending-action.repository.interface';
import type {
  ListPendingActionsFilter,
  PendingAction,
  PendingActionActor,
  PendingActionStatus,
} from '@/src/entities/models/pending-action';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface PendingActionResponseDto {
  id: string;
  action_name: string;
  input: unknown;
  actor: unknown;
  status: string;
  rationale: string | null;
  result: unknown;
  error_message: string | null;
  created_at: string;
  decided_at: string | null;
  expires_at: string;
}

export class CoreApiPendingActionRepository implements PendingActionRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(filter?: ListPendingActionsFilter): Promise<readonly PendingAction[]> {
    const search = new URLSearchParams();
    if (filter?.status) search.set('status', filter.status);
    if (filter?.actorSource) search.set('actor_source', filter.actorSource);
    if (filter?.runId) search.set('run_id', filter.runId);
    const query = search.toString();
    const response = await this.request<PendingActionResponseDto[]>(
      query ? `/pending-actions?${query}` : '/pending-actions',
      { method: 'GET' },
    );
    return response.map(mapPendingAction);
  }

  public async findById(id: string): Promise<PendingAction> {
    const response = await this.request<PendingActionResponseDto>(pendingActionPath(id), {
      method: 'GET',
    });
    return mapPendingAction(response);
  }

  public async approve(id: string): Promise<PendingAction> {
    const response = await this.request<PendingActionResponseDto>(
      `${pendingActionPath(id)}/approve`,
      { method: 'POST' },
    );
    return mapPendingAction(response);
  }

  public async reject(id: string): Promise<PendingAction> {
    const response = await this.request<PendingActionResponseDto>(
      `${pendingActionPath(id)}/reject`,
      { method: 'POST' },
    );
    return mapPendingAction(response);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function pendingActionPath(id: string): string {
  return `/pending-actions/${encodeURIComponent(id)}`;
}

function mapPendingAction(dto: PendingActionResponseDto): PendingAction {
  return {
    id: dto.id,
    actionName: dto.action_name,
    input: dto.input,
    actor: mapActor(dto.actor),
    status: mapStatus(dto.status),
    rationale: dto.rationale,
    result: dto.result,
    errorMessage: dto.error_message,
    createdAt: dto.created_at,
    decidedAt: dto.decided_at,
    expiresAt: dto.expires_at,
  };
}

function mapActor(raw: unknown): PendingActionActor {
  const candidate = (raw ?? {}) as Record<string, unknown>;
  const source = candidate['source'];
  return {
    source: isActorSource(source) ? source : 'anonymous',
    runId: typeof candidate['runId'] === 'string' ? candidate['runId'] : null,
    identityId: typeof candidate['identityId'] === 'string' ? candidate['identityId'] : null,
  };
}

function isActorSource(value: unknown): value is PendingActionActor['source'] {
  return (
    value === 'agent' || value === 'browser' || value === 'dev-bypass' || value === 'anonymous'
  );
}

function mapStatus(value: string): PendingActionStatus {
  if (value === 'pending' || value === 'approved' || value === 'rejected' || value === 'failed') {
    return value;
  }
  throw new Error(`Unknown pending action status: ${value}`);
}

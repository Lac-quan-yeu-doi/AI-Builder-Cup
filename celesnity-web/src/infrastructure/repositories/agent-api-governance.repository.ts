import type { GovernanceRepository } from '@/src/application/repositories/governance.repository.interface';
import type {
  GovernanceEvidencePage,
  ManifestGovernance,
  RunGovernance,
} from '@/src/entities/models/governance';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface GovernanceDto {
  policy_revision: string;
  admitted_at: string;
  policy: ManifestGovernance['policy'];
  owner?: string;
  run_id?: string;
  data_scope?: { readonly catalog?: string; readonly schema: string } | null;
}

interface GovernanceEvidenceDto {
  id: string;
  owner: string;
  run_id: string;
  seq: number;
  at: string;
  kind: GovernanceEvidencePage['items'][number]['kind'];
  detail: Record<string, unknown>;
}

interface GovernanceEvidencePageDto {
  items: readonly GovernanceEvidenceDto[];
  next_cursor?: string;
}

export class AgentApiGovernanceRepository implements GovernanceRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async getManifestGovernance(name: string): Promise<ManifestGovernance> {
    return mapManifest(
      await this.request<GovernanceDto>(`/agent-manifests/${encodeURIComponent(name)}/governance`, {
        method: 'GET',
      }),
    );
  }

  public async validateManifestGovernance(yaml: string): Promise<ManifestGovernance> {
    return mapManifest(
      await this.request<GovernanceDto>('/agent-manifests/governance/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml }),
      }),
    );
  }

  public async getRunGovernance(runId: string): Promise<RunGovernance> {
    const dto = await this.request<GovernanceDto>(`/runs/${encodeURIComponent(runId)}/governance`, {
      method: 'GET',
    });
    return {
      ...mapManifest(dto),
      owner: dto.owner ?? '',
      runId: dto.run_id ?? runId,
      dataScope: dto.data_scope ?? null,
    };
  }

  public async getRunGovernanceEvidence(
    runId: string,
    cursor?: string,
  ): Promise<GovernanceEvidencePage> {
    const suffix = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    const dto = await this.request<GovernanceEvidencePageDto>(
      `/runs/${encodeURIComponent(runId)}/governance/evidence${suffix}`,
      { method: 'GET' },
    );
    return {
      items: dto.items.map((item) => ({
        id: item.id,
        owner: item.owner,
        runId: item.run_id,
        seq: item.seq,
        at: item.at,
        kind: item.kind,
        detail: item.detail,
      })),
      ...(dto.next_cursor === undefined ? {} : { nextCursor: dto.next_cursor }),
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      return await this.transport.request<T>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapManifest(dto: GovernanceDto): ManifestGovernance {
  return { policyRevision: dto.policy_revision, admittedAt: dto.admitted_at, policy: dto.policy };
}

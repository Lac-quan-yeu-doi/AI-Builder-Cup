import type { AuditWriter } from './audit-writer';

export const AGENT_MANIFEST_ORGANIZATIONS = Symbol('AGENT_MANIFEST_ORGANIZATIONS');
export interface AgentManifestOrganization {
  readonly organizationId: string;
  readonly identityTenantId: string;
}
export interface AgentManifestOrganizations {
  listActive(): Promise<readonly AgentManifestOrganization[]>;
}

/** Control-plane inventory only; confers no application or catalog access. */
export class AgentManifestOrganizationInventory {
  public constructor(private readonly repository: AgentManifestOrganizations, private readonly audit: AuditWriter) {}

  public async list(workload: string, requestId?: string): Promise<readonly AgentManifestOrganization[]> {
    const organizations = await this.repository.listActive();
    for (const organization of organizations) {
      await this.audit.write({
        organizationId: organization.organizationId,
        requestId,
        eventType: 'CONFIGURATION_CHANGE',
        action: 'agent-manifests:migration-inventory',
        outcome: 'SUCCEEDED',
        metadata: { workload },
      });
    }
    return organizations;
  }
}

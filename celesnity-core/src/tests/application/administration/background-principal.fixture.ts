import {
  AuthenticatedContextStore,
  type AuthenticatedContext,
} from '@application/administration/authenticated-context';
import type { WorkspaceFeature } from '@application/administration/workspace-feature';

/** Test-only compatibility wrapper; production callers must name the feature explicitly. */
export class TestBackgroundContextStore extends AuthenticatedContextStore {
  public override runBackground<T>(
    organizationId: string,
    work: () => T,
    feature: WorkspaceFeature = 'EXECUTIONS',
  ): Promise<Awaited<T>> {
    return super.runBackground(organizationId, work, feature);
  }
}

export function backgroundPrincipal(organizationId: string): AuthenticatedContext {
  return {
    identityId: `service-${organizationId}`,
    subject: `worker-${organizationId}`,
    identityTenantId: `tenant-${organizationId}`,
    organizationId,
    organizationStatus: 'ACTIVE',
    membershipId: `membership-${organizationId}`,
    role: 'SERVICE_ACCOUNT',
    mfaRequired: false,
    mfaVerified: false,
    authenticationTime: 1,
    servicePermissions: ['workspace:read', 'workspace:write'],
    visibleFeatures: ['AUTOMATIONS', 'DOCUMENTS', 'EXECUTIONS', 'DEVICES', 'CRAWLER'],
  };
}

export function backgroundContexts(): TestBackgroundContextStore {
  const contexts = new TestBackgroundContextStore();
  contexts.configureBackgroundResolver(async (org) => backgroundPrincipal(org));
  return contexts;
}

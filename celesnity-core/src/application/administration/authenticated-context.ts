import { AsyncLocalStorage } from 'node:async_hooks';
import type { WorkspaceFeature } from './workspace-feature';
import type { Permission } from './authorization-policy';
import { requireAccess } from './access-policy';

export type OrganizationRole =
  | 'PLATFORM_ADMIN'
  | 'SUPPORT'
  | 'ORG_OWNER'
  | 'ORG_ADMIN'
  | 'DATA_ENGINEER'
  | 'ANALYST'
  | 'VIEWER'
  | 'AUDITOR'
  | 'SERVICE_ACCOUNT';

export interface AuthenticatedContext {
  readonly identityId: string;
  readonly subject: string;
  readonly identityTenantId: string;
  readonly organizationId: string;
  readonly organizationStatus: 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDING' | 'CLOSED';
  readonly mfaRequired: boolean;
  readonly membershipId: string;
  readonly role: OrganizationRole;
  readonly sessionId?: string;
  /** Correlates delegated resource decisions with the incoming Core request. */
  readonly requestId?: string;
  readonly authenticationTime: number;
  readonly mfaVerified: boolean;
  readonly email?: string;
  /** Null preserves unrestricted access; an empty list explicitly grants no workspace features. */
  readonly visibleFeatures?: readonly WorkspaceFeature[] | null;
  /** Additional permission ceiling for a persisted organization service identity. */
  readonly servicePermissions?: readonly Permission[];
  /** Organization-owned agent selected for this delegated tool call. */
  readonly agentName?: string;
  /** Core-registered limit for this human-delegated Agent run; null means all databases. */
  readonly agentRunScope?: { readonly catalog?: string; readonly schema: string } | null;
  readonly agentRunId?: string;
  /** Core-registered automation run authorizing a delegated service operation. */
  readonly automationRunId?: string;
  /** Verified workload's separately provisioned organization service actor. */
  readonly agentServiceIdentityId?: string;
}

export class AuthenticatedContextStore {
  private readonly storage = new AsyncLocalStorage<AuthenticatedContext>();
  private backgroundResolver?: (organizationId: string) => Promise<AuthenticatedContext>;
  private agentResolver?: (organizationId: string) => Promise<AuthenticatedContext>;

  /** Installed once by persistence wiring, never by an incoming request. */
  public configureBackgroundResolver(
    resolver: (organizationId: string) => Promise<AuthenticatedContext>,
  ): void {
    if (this.backgroundResolver) throw new Error('Background identity resolver already configured');
    this.backgroundResolver = resolver;
  }

  public configureAgentResolver(
    resolver: (organizationId: string) => Promise<AuthenticatedContext>,
  ): void {
    if (this.agentResolver) throw new Error('Agent identity resolver already configured');
    this.agentResolver = resolver;
  }

  public async resolveAgentIdentity(
    organizationId: string,
    requirement: { readonly permission: Permission; readonly feature: WorkspaceFeature },
  ): Promise<AuthenticatedContext> {
    if (!this.agentResolver) throw new Error('Agent identity resolver is required');
    const context = await this.agentResolver(organizationId);
    if (
      context.organizationId !== organizationId ||
      context.organizationStatus !== 'ACTIVE' ||
      context.role !== 'SERVICE_ACCOUNT' ||
      context.servicePermissions === undefined ||
      context.visibleFeatures == null
    )
      throw new Error('Agent service identity is invalid');
    try {
      requireAccess(context, {
        permission: requirement.permission,
        anyFeature: [requirement.feature],
        resourceOrganizationId: organizationId,
      });
    } catch {
      // A service ceiling is not the delegated user's feature grant. Keep the
      // two denial reasons distinct in MCP errors and authorization audits.
      throw new Error('SERVICE_IDENTITY_DENIED: Agent service capability is not enabled.');
    }
    return context;
  }

  /**
   * Runs the complete downstream operation inside one authenticated tenant
   * scope. `run` is deliberately preferred at request boundaries because an
   * `enterWith` performed after an awaited guard operation does not propagate
   * back into Nest's caller and the next global guard can lose the context.
   */
  public run<T>(context: AuthenticatedContext, work: () => T): T {
    return this.storage.run(Object.freeze(context), work);
  }

  /** Runs a verified background event inside its persisted tenant boundary. */
  public async runBackground<T>(
    organizationId: string,
    work: () => T,
    feature: WorkspaceFeature,
  ): Promise<Awaited<T>> {
    if (!this.backgroundResolver) throw new Error('Background identity resolver is required');
    const context = await this.backgroundResolver(organizationId);
    if (
      context.organizationId !== organizationId ||
      context.organizationStatus !== 'ACTIVE' ||
      context.role !== 'SERVICE_ACCOUNT' ||
      context.servicePermissions === undefined ||
      context.visibleFeatures == null
    ) {
      throw new Error('Background service identity is invalid');
    }
    requireAccess(context, {
      permission: 'workspace:write',
      anyFeature: [feature],
      resourceOrganizationId: organizationId,
    });
    return await this.run(context, work);
  }

  /**
   * Continues verified durable work as the principal that originally requested
   * it. The caller must re-authorize this identity immediately before entering
   * this scope; this method only propagates that decision to ambient consumers.
   */
  public runAuthorizedBackgroundActor<T>(
    organizationId: string,
    identityId: string,
    work: () => T,
  ): T {
    return this.run(
      {
        identityId,
        subject: 'celesnity-core-authorized-background-actor',
        identityTenantId: 'authorized-background-actor',
        organizationId,
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: identityId,
        role: 'SERVICE_ACCOUNT',
        authenticationTime: 0,
        mfaVerified: true,
        visibleFeatures: null,
      },
      work,
    );
  }

  public current(): AuthenticatedContext | undefined {
    return this.storage.getStore();
  }

  public require(): AuthenticatedContext {
    const context = this.current();
    if (context === undefined) throw new Error('Authenticated organization context is required');
    return context;
  }
}

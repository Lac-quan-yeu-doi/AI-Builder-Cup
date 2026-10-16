import { randomUUID } from 'node:crypto';
import type { AuthenticatedContextStore } from './authenticated-context';
import type { AuditWriter } from './audit-writer';
import type { AgentRoomDelegationRepository } from './agent-room-delegation.repository';
import type { WorkspaceFeature } from './workspace-feature';
import { requireAccess, type AccessRequirement } from './access-policy';
import type { Permission } from './authorization-policy';
import { recordAuthorizationDecision } from './authorization-decision';

export class AgentRoomDelegationService {
  public constructor(
    private readonly repository: AgentRoomDelegationRepository,
    private readonly contexts: AuthenticatedContextStore,
    private readonly audit: AuditWriter,
    private readonly defaultCatalog: string,
  ) {}

  /**
   * Runs an MCP tool as the active user who originally bound the room.
   * The repository derives the organization from that binding and rechecks
   * identity, organization, and membership state on every call.
   */
  public async run<T>(
    roomId: string,
    callerSubject: string,
    work: () => Promise<T>,
    requirement: AccessRequirement = { permission: 'workspace:read' },
    agentName?: string,
    runId?: string,
    requestId?: string,
    workloadEmail?: string,
  ): Promise<T> {
    const feature = requirement.anyFeature?.[0];
    if (feature === undefined || requirement.anyFeature?.length !== 1)
      throw new Error('A single Agent service feature ceiling is required.');
    const principal = await this.repository.resolve(roomId, callerSubject);
    if (principal === undefined) {
      throw new Error('MCP room delegation is invalid or no longer active.');
    }
    const correlationId = requestId ?? randomUUID();
    let scope: { readonly catalog?: string; readonly schema: string } | null | undefined;
    const writeDecision = (allowed: boolean, reason: string, agentIdentityId?: string): Promise<void> =>
      recordAuthorizationDecision(this.audit, {
        organizationId: principal.organizationId,
        actorIdentityId: principal.identityId,
        serviceIdentityId: agentIdentityId,
        sessionId: principal.sessionId,
        requestId: correlationId,
        action: `mcp:${feature}:${requirement.permission}`,
        resourceType: 'agent-room-run',
        resourceId: roomId,
        allowed, reason, roomId, runId, agentName, workloadEmail,
        ...(scope === undefined ? {} : {
          databaseScope: scope === null ? null : `${scope.catalog ?? this.defaultCatalog}.${scope.schema}`,
        }),
      });
    let agentIdentityId: string;
    try {
      if (principal.agentName === undefined || principal.agentName !== agentName)
        throw new Error('AGENT_MISMATCH: MCP agent does not match the room binding.');
      if (runId === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId))
        throw new Error('RUN_REGISTRATION_REQUIRED: MCP run registration is required.');
      const resolvedScope = await this.repository.resolveRun(runId, roomId, principal);
      if (resolvedScope === undefined)
        throw new Error('RUN_REGISTRATION_INVALID: MCP run registration is invalid or expired.');
      scope = resolvedScope;
      requireAccess(principal, requirement);
      const agent = await this.contexts.resolveAgentIdentity(principal.organizationId, {
        permission: requirement.permission,
        feature,
      });
      agentIdentityId = agent.identityId;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const prefix = message.split(':', 1)[0];
      const reason = prefix !== undefined && /^[A-Z][A-Z_]+$/.test(prefix)
        ? prefix
        : message.includes('service identity')
          ? 'SERVICE_IDENTITY_DENIED'
          : 'DEFAULT_DENY';
      await writeDecision(false, reason);
      throw error;
    }
    // Audit-write failure denies the operation before data access.
    await writeDecision(true, 'EXPLICIT_ALLOW', agentIdentityId);
    return this.contexts.run({
      ...principal,
      agentRunId: runId,
      agentRunScope: scope,
      agentServiceIdentityId: agentIdentityId,
      requestId: correlationId,
    }, work);
  }

  public registerRun(
    roomId: string,
    runId: string,
    agentName: string,
    scope: { readonly catalog?: string; readonly schema: string } | null,
  ): Promise<void> {
    const principal = this.contexts.require();
    requireAccess(principal, { permission: 'workspace:read' });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId))
      throw new Error('A valid Agent run ID is required.');
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(agentName))
      throw new Error('A valid organization Agent is required.');
    if (scope !== null &&
      (scope.schema.trim().length === 0 || scope.schema.length > 255 ||
       (scope.catalog !== undefined && (scope.catalog.trim().length === 0 || scope.catalog.length > 255))))
      throw new Error('A valid selected database is required.');
    return this.repository.registerRun({
      roomId, runId, agentName,
      scope: scope === null ? null : { catalog: scope.catalog ?? this.defaultCatalog, schema: scope.schema },
      principal,
    });
  }

  public closeRun(roomId: string, runId: string): Promise<void> {
    return this.repository.closeRun(roomId, runId, this.contexts.require());
  }

  public async runForFeature<T>(
    roomId: string,
    callerSubject: string,
    feature: WorkspaceFeature,
    work: () => Promise<T>,
    permission: Permission = 'workspace:read',
    agentName?: string,
    runId?: string,
    requestId?: string,
    workloadEmail?: string,
  ): Promise<T> {
    return this.run(roomId, callerSubject, work, { permission, anyFeature: [feature] }, agentName, runId, requestId, workloadEmail);
  }

  /**
   * Automation runs do not have a human room binding. They are still scoped
   * to a workflow step owned by one organization before the machine principal
   * is installed, so MCP tools retain the same tenant boundary.
   */
  public async runForAutomation<T>(
    agentRunId: string,
    organizationId: string,
    feature: WorkspaceFeature,
    work: () => Promise<T>,
    permission: Permission = 'workspace:read',
    agentName?: string,
    requestId?: string,
    workloadEmail?: string,
  ): Promise<T> {
    const correlationId = requestId ?? randomUUID();
    let principal: Awaited<ReturnType<AuthenticatedContextStore['resolveAgentIdentity']>> | undefined;
    try {
      if (agentName === undefined || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(agentName))
        throw new Error('AUTOMATION_AGENT_INVALID: Automation MCP agent identity is required.');
      const validRun = await this.repository.automationRunBelongsToOrganization(
        agentRunId, organizationId, agentName,
      );
      if (!validRun) throw new Error('AUTOMATION_RUN_INVALID: Automation MCP delegation is invalid.');
      principal = await this.contexts.resolveAgentIdentity(organizationId, { permission, feature });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const prefix = message.split(':', 1)[0];
      await recordAuthorizationDecision(this.audit, {
        organizationId,
        actorIdentityId: principal?.identityId,
        requestId: correlationId,
        action: `mcp:${feature}:${permission}`,
        resourceType: 'automation-agent-run',
        resourceId: agentRunId,
        runId: agentRunId,
        agentName,
        workloadEmail,
        allowed: false,
        reason: prefix !== undefined && /^[A-Z][A-Z_]+$/.test(prefix) ? prefix : 'DEFAULT_DENY',
      });
      throw error;
    }
    await recordAuthorizationDecision(this.audit, {
      organizationId,
      actorIdentityId: principal.identityId,
      serviceIdentityId: principal.identityId,
      requestId: correlationId,
      action: `mcp:${feature}:${permission}`,
      resourceType: 'automation-agent-run',
      resourceId: agentRunId,
      runId: agentRunId,
      agentName,
      workloadEmail,
      allowed: true,
      reason: 'EXPLICIT_ALLOW',
    });
    return this.contexts.run({ ...principal, agentName, automationRunId: agentRunId, requestId: correlationId }, work);
  }
}

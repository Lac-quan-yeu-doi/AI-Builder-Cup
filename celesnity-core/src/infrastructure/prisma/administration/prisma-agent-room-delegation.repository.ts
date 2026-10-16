import { Injectable } from '@nestjs/common';

import type { AgentRoomDelegationRepository } from '@application/administration/agent-room-delegation.repository';
import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { resolveVisibleWorkspaceFeatures } from './prisma-workspace-feature-access';

@Injectable()
export class PrismaAgentRoomDelegationRepository implements AgentRoomDelegationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async registerRun(input: {
    readonly roomId: string;
    readonly runId: string;
    readonly agentName: string;
    readonly scope: { readonly catalog?: string; readonly schema: string } | null;
    readonly principal: AuthenticatedContext;
  }): Promise<void> {
    const { principal } = input;
    await this.prisma.transaction(async (client) => {
      const binding = await client.agentRoomBinding.findUnique({
        where: { roomId: input.roomId },
        select: {
          organizationId: true, boundById: true, agentName: true, mfaVerifiedUntil: true,
        },
      });
      const assuranceUntil = binding?.mfaVerifiedUntil;
      if (
        !binding || binding.organizationId !== principal.organizationId ||
        binding.boundById !== principal.identityId || binding.agentName !== input.agentName ||
        (principal.mfaRequired && !principal.mfaVerified) ||
        assuranceUntil === null || assuranceUntil === undefined || assuranceUntil.getTime() <= Date.now()
      ) throw new Error('Agent room binding or MFA assurance is invalid.');
      await client.agentRunScope.updateMany({
        where: { roomId: input.roomId, closedAt: null },
        data: { closedAt: new Date() },
      });
      await client.agentRunScope.create({
        data: {
          runId: input.runId,
          roomId: input.roomId,
          organizationId: principal.organizationId,
          boundById: principal.identityId,
          agentName: input.agentName,
          catalog: input.scope?.catalog ?? null,
          schema: input.scope?.schema ?? null,
          expiresAt: assuranceUntil,
        },
      });
    });
  }

  public async resolveRun(
    runId: string,
    roomId: string,
    principal: AuthenticatedContext,
  ): Promise<{ readonly catalog?: string; readonly schema: string } | null | undefined> {
    const record = await this.prisma.findAgentRunScope(runId);
    if (
      !record || record.roomId !== roomId ||
      record.organizationId !== principal.organizationId ||
      record.boundById !== principal.identityId ||
      record.agentName !== principal.agentName || record.closedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) return undefined;
    if (record.schema === null) return null;
    return { schema: record.schema, ...(record.catalog === null ? {} : { catalog: record.catalog }) };
  }

  public async closeRun(roomId: string, runId: string, principal: AuthenticatedContext): Promise<void> {
    await this.prisma.client.agentRunScope.updateMany({
      where: { runId, roomId, organizationId: principal.organizationId, boundById: principal.identityId, closedAt: null },
      data: { closedAt: new Date() },
    });
  }

  public async automationRunBelongsToOrganization(
    agentRunId: string,
    organizationId: string,
    agentName: string,
  ): Promise<boolean> {
    const stepRun = await this.prisma.client.automationWorkflowStepRun.findFirst({
      where: {
        agentRunId,
        status: 'running',
        run: { status: 'running', workflow: { organizationId } },
        step: { agentId: agentName },
      },
      select: { id: true },
    });
    return stepRun !== null;
  }

  public async resolve(
    roomId: string,
    callerSubject: string,
  ): Promise<AuthenticatedContext | undefined> {
    const binding = await this.prisma.findAgentRoomDelegationBinding(roomId, callerSubject);

    if (
      binding === null ||
      binding.organization.status !== 'ACTIVE' ||
      binding.boundBy.status !== 'ACTIVE' ||
      binding.boundBy.subject !== callerSubject ||
      typeof binding.agentName !== 'string'
    ) {
      return undefined;
    }

    const membership = binding.boundBy.memberships.find(
      (candidate) => candidate.organizationId === binding.organizationId,
    );
    if (membership?.role === 'SERVICE_ACCOUNT') {
      const service = await this.prisma.resolveBackgroundIdentity(binding.organizationId);
      // A binding cannot impersonate another service actor in the same organization.
      return service.identityId === binding.boundBy.id && service.subject === callerSubject
        ? { ...service, agentName: binding.agentName }
        : undefined;
    }
    const identityTenantId = binding.boundBy.identityTenantId;
    if (
      membership === undefined ||
      identityTenantId === null ||
      identityTenantId !== binding.organization.identityTenantId
    ) {
      return undefined;
    }
    const visibleFeatures = await resolveVisibleWorkspaceFeatures(
      this.prisma,
      binding.organizationId,
      binding.boundBy.id,
      membership.role,
    );

    return {
      identityId: binding.boundBy.id,
      subject: binding.boundBy.subject,
      identityTenantId,
      organizationId: binding.organizationId,
      organizationStatus: binding.organization.status,
      mfaRequired: binding.organization.mfaRequired,
      membershipId: membership.id,
      role: membership.role,
      authenticationTime: 0,
      // The binding is renewed only by a verified human Core request. Its
      // assurance is short-lived; membership and organization are rechecked
      // above on every tool call, including after an assurance expires.
      mfaVerified: (binding.mfaVerifiedUntil?.getTime() ?? 0) > Date.now(),
      agentName: binding.agentName,
      email: binding.boundBy.email ?? undefined,
      visibleFeatures,
    };
  }
}

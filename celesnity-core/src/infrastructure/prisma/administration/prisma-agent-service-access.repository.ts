import { Injectable } from '@nestjs/common';

import type {
  AgentServiceAccessRepository,
  AgentWorkloadIdentity,
} from '@application/administration/agent-service-access.repository';
import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import { PrismaService } from '../prisma.service';
import { resolveVisibleWorkspaceFeatures } from './prisma-workspace-feature-access';

@Injectable()
export class PrismaAgentServiceAccessRepository implements AgentServiceAccessRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public resolveDelegatedRoomPrincipal(
    roomId: string,
    callerSubject: string,
    workload: AgentWorkloadIdentity,
  ): Promise<AuthenticatedContext | null> {
    return this.resolveRoomPrincipal(roomId, workload, callerSubject);
  }

  public async resolveRoomPrincipal(
    roomId: string,
    workload: AgentWorkloadIdentity,
    callerSubject?: string,
  ): Promise<AuthenticatedContext | null> {
    const binding = await this.prisma.client.agentRoomBinding.findUnique({
      where: { roomId },
      include: { organization: true },
    });
    if (binding === null || binding.organization.status !== 'ACTIVE') return null;

    // A verified workload and a delegated human do not replace the explicit
    // organization-level Agent service identity. Both paths fail closed when
    // the owner disables or revokes it.
    let service: AuthenticatedContext;
    try {
      service = await this.prisma.resolveAgentIdentity(binding.organizationId);
    } catch {
      return null;
    }

    if (callerSubject !== undefined) {
      const caller = callerSubject.trim();
      if (caller === '' || caller === workload.subject) return null;
      const identity = await this.prisma.client.userIdentity.findFirst({
        where: { subject: caller, status: 'ACTIVE' },
        include: {
          memberships: {
            where: { organizationId: binding.organizationId, status: 'ACTIVE' },
            take: 1,
          },
        },
      });
      const membership = identity?.memberships[0];
      if (!identity || !membership) return null;
      const visibleFeatures = await resolveVisibleWorkspaceFeatures(
        this.prisma,
        binding.organizationId,
        identity.id,
        membership.role,
      );
      return {
        identityId: identity.id,
        subject: identity.subject,
        identityTenantId: identity.identityTenantId ?? '',
        organizationId: binding.organizationId,
        organizationStatus: binding.organization.status,
        mfaRequired: binding.organization.mfaRequired,
        membershipId: membership.id,
        role: membership.role,
        authenticationTime: workload.authenticationTime,
        mfaVerified: true,
        email: identity.email ?? undefined,
        visibleFeatures,
      };
    }

    return {
      ...service,
      authenticationTime: workload.authenticationTime,
      // Verified workload identity authenticates the caller; it is not human MFA.
      mfaVerified: false,
    };
  }
}

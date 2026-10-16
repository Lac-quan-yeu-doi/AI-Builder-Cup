import { Injectable } from '@nestjs/common';
import type { AgentManifestOrganization, AgentManifestOrganizations } from '@application/administration/agent-manifest-organizations';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaAgentManifestOrganizationsRepository implements AgentManifestOrganizations {
  public constructor(private readonly prisma: PrismaService) {}

  public async listActive(): Promise<readonly AgentManifestOrganization[]> {
    const organizations = await this.prisma.client.organization.findMany({
      where: { status: 'ACTIVE', identityTenantId: { not: null } },
      select: { id: true, identityTenantId: true },
      orderBy: { id: 'asc' },
    });
    return organizations.map((organization) => {
      if (!organization.identityTenantId?.trim()) throw new Error('Active organization has invalid tenant binding');
      return { organizationId: organization.id, identityTenantId: organization.identityTenantId };
    });
  }
}

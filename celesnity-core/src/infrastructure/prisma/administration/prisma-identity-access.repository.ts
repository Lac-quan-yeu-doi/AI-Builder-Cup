import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import type { VerifiedIdentityToken } from '@application/administration/identity-token.verifier';
import type { IdentityAccessRepository } from '@application/administration/identity-access.repository';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { resolveVisibleWorkspaceFeatures } from './prisma-workspace-feature-access';

@Injectable()
export class PrismaIdentityAccessRepository implements IdentityAccessRepository {
  private readonly defaultOrganizationId: string;
  private readonly identityProvider: 'identity-platform' | 'local-development';

  public constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.defaultOrganizationId = config.getOrThrow<string>('DEFAULT_ORGANIZATION_ID');
    this.identityProvider =
      config.getOrThrow<string>('CELESNITY_AUTH_MODE') === 'local-development'
        ? 'local-development'
        : 'identity-platform';
  }

  public async resolve(token: VerifiedIdentityToken): Promise<AuthenticatedContext | undefined> {
    const organization = await this.prisma.client.organization.findUnique({
      where: { identityTenantId: token.tenantId },
    });
    if (organization === null || organization.status !== 'ACTIVE') return undefined;

    const existingIdentity = await this.prisma.client.userIdentity.findFirst({
      where: {
        provider: this.identityProvider,
        subject: token.subject,
        OR: [{ identityTenantId: token.tenantId }, { identityTenantId: null }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existingIdentity === null) return undefined;
    const identity = await this.prisma.client.userIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        identityTenantId: token.tenantId,
        email: token.email,
        displayName: token.displayName,
        emailVerified: token.emailVerified,
        lastLoginAt: new Date(),
      },
    });
    if (identity.status !== 'ACTIVE') return undefined;

    const membership = await this.prisma.client.organizationMembership.findFirst({
      where: {
        identityId: identity.id,
        organizationId: organization.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (membership === null) return undefined;
    if (membership.role === 'ORG_OWNER') {
      await this.ensureOwnerCatalogAccess(organization.id, identity.id);
    }
    const visibleFeatures = await resolveVisibleWorkspaceFeatures(
      this.prisma,
      organization.id,
      identity.id,
      membership.role,
    );
    return {
      identityId: identity.id,
      subject: token.subject,
      identityTenantId: token.tenantId,
      organizationId: membership.organizationId,
      organizationStatus: organization.status,
      mfaRequired: organization.mfaRequired,
      membershipId: membership.id,
      role: membership.role,
      sessionId: token.sessionId,
      authenticationTime: token.authenticationTime,
      mfaVerified: token.mfaVerified,
      email: token.email,
      visibleFeatures,
    };
  }

  private async ensureOwnerCatalogAccess(
    organizationId: string,
    identityId: string,
  ): Promise<void> {
    const group = await this.prisma.client.authorizationGroup.upsert({
      where: { organizationId_name: { organizationId, name: 'Organization Owners' } },
      create: {
        id: randomUUID(),
        organizationId,
        name: 'Organization Owners',
        description: 'Tenant-bound owners with full named-resource administration access.',
      },
      update: {},
    });
    await this.prisma.client.authorizationGroupMember.upsert({
      where: { groupId_identityId: { groupId: group.id, identityId } },
      create: { id: randomUUID(), groupId: group.id, identityId },
      update: {},
    });
    const existingGrant = await this.prisma.client.catalogAccessGrant.findFirst({
      where: {
        organizationId,
        groupId: group.id,
        resourceType: 'CATALOG',
        resourceId: '*',
        effect: 'ALLOW',
      },
      select: { id: true },
    });
    if (existingGrant === null) {
      await this.prisma.client.catalogAccessGrant.create({
        data: {
          id: randomUUID(),
          organizationId,
          groupId: group.id,
          resourceType: 'CATALOG',
          resourceId: '*',
          permissions: ['OWN'],
          effect: 'ALLOW',
          includeDescendants: true,
          grantOption: true,
          createdById: identityId,
        },
      });
    }
  }

  public async recordAuthenticationFailure(
    subject: string | undefined,
    tenantId: string | undefined,
    requestId: string | undefined,
  ): Promise<void> {
    const organization =
      tenantId === undefined
        ? null
        : await this.prisma.client.organization.findUnique({
            where: { identityTenantId: tenantId },
            select: { id: true },
          });
    const identity =
      subject === undefined
        ? null
        : await this.prisma.client.userIdentity.findFirst({
            where: {
              provider: 'identity-platform',
              subject,
              ...(tenantId === undefined ? {} : { identityTenantId: tenantId }),
            },
            select: { id: true },
          });
    await this.prisma.client.auditEvent.create({
      data: {
        id: randomUUID(),
        organizationId: organization?.id ?? this.defaultOrganizationId,
        actorIdentityId: identity?.id,
        requestId,
        eventType: 'AUTHENTICATION',
        action: 'SESSION_VALIDATE',
        outcome: 'FAILED',
        metadata: {},
      },
    });
  }
}

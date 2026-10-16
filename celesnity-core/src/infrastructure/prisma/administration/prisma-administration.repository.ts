import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';

import type { AdministrationRepository } from '@application/administration/administration.repository';
import type { OrganizationRole } from '@application/administration/authenticated-context';
import type {
  CatalogAuthorizationDecision,
  CatalogPermission,
  CatalogResourceRef,
  CreateCatalogGrantInput,
} from '@application/administration/catalog-authorization';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { WorkspaceFeature } from '@application/administration/workspace-feature';

@Injectable()
export class PrismaAdministrationRepository implements AdministrationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async me(
    identityId: string,
    identityTenantId: string,
    organizationId: string,
    email: string | undefined,
    mfaVerified: boolean,
    visibleFeatures: readonly WorkspaceFeature[] | null | undefined,
  ): Promise<unknown> {
    const membership = await this.prisma.client.organizationMembership.findFirstOrThrow({
      where: { identityId, organizationId, status: 'ACTIVE' },
      include: { organization: true },
    });
    return {
      identityId,
      identityTenantId,
      email,
      mfaVerified,
      visibleFeatures: visibleFeatures ?? null,
      organization: {
        organizationId: membership.organizationId,
        organizationName: membership.organization.displayName,
        homeRegion: membership.organization.homeRegion,
        mfaRequired: membership.organization.mfaRequired,
        role: membership.role,
      },
    };
  }
  public currentOrganization(organizationId: string): Promise<unknown> {
    return this.prisma.client.organization.findUniqueOrThrow({ where: { id: organizationId } });
  }
  public async mfaPolicy(identityTenantId: string): Promise<{ mfaRequired: boolean }> {
    const organization = await this.prisma.client.organization.findFirst({
      where: { identityTenantId, status: 'ACTIVE' },
      select: { mfaRequired: true },
    });
    if (organization === null) throw resourceNotFound();
    return organization;
  }
  public async loginContext(
    organizationSlug: string,
  ): Promise<{ identityTenantId: string; mfaRequired: boolean }> {
    const organization = await this.prisma.client.organization.findFirst({
      where: { slug: organizationSlug, status: 'ACTIVE' },
      select: { identityTenantId: true, mfaRequired: true },
    });
    if (organization?.identityTenantId === null || organization === null) throw resourceNotFound();
    return {
      identityTenantId: organization.identityTenantId,
      mfaRequired: organization.mfaRequired,
    };
  }
  public async enableMfa(organizationId: string, identityTenantId: string): Promise<unknown> {
    const result = await this.prisma.client.organization.updateMany({
      where: { id: organizationId, identityTenantId },
      data: { mfaRequired: true },
    });
    if (result.count === 0) {
      throw new ConflictException({
        code: 'IDENTITY_TENANT_MISMATCH',
        message: 'The organization is not bound to the configured Identity Platform tenant.',
        details: null,
      });
    }
    return this.prisma.client.organization.findUniqueOrThrow({ where: { id: organizationId } });
  }
  public listMemberships(organizationId: string): Promise<unknown> {
    return this.prisma.client.organizationMembership.findMany({
      where: { organizationId },
      include: { identity: { select: { id: true, email: true, displayName: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  public listServiceIdentities(organizationId: string): Promise<unknown> {
    return this.prisma.client.organizationServiceIdentity.findMany({
      where: { organizationId },
      select: {
        purpose: true,
        identityId: true,
        enabled: true,
        permissions: true,
        features: true,
        updatedAt: true,
        identity: { select: { status: true } },
      },
      orderBy: { purpose: 'asc' },
    });
  }
  public async updateAgentServiceIdentity(
    organizationId: string,
    actorIdentityId: string,
    requestId: string | undefined,
    enabled: boolean,
    permissions: readonly ('workspace:read' | 'workspace:write')[],
    features: readonly WorkspaceFeature[],
  ): Promise<unknown> {
    return this.prisma.transaction(async (transaction) => {
      const binding = await transaction.organizationServiceIdentity.findUnique({
        where: { organizationId_purpose: { organizationId, purpose: 'AGENT' } },
        include: { organization: true, identity: { include: { memberships: true } } },
      });
      const membership = binding?.identity.memberships.find(
        (item) => item.organizationId === organizationId && item.role === 'SERVICE_ACCOUNT',
      );
      if (
        !binding ||
        binding.organization.status !== 'ACTIVE' ||
        binding.identity.status !== 'ACTIVE' ||
        binding.identity.provider !== 'organization-service' ||
        membership?.status !== 'ACTIVE' ||
        (membership.expiresAt !== null && membership.expiresAt <= new Date()) ||
        (enabled && (!permissions.includes('workspace:read') || features.length === 0)) ||
        permissions.some((permission) => !binding.permissions.includes(permission)) ||
        features.some((feature) => !binding.features.includes(feature))
      ) {
        throw new ConflictException({ code: 'AGENT_SERVICE_IDENTITY_INVALID' });
      }
      const updated = await transaction.organizationServiceIdentity.updateMany({
        where: {
          organizationId,
          purpose: 'AGENT',
          enabled: binding.enabled,
          permissions: { equals: binding.permissions },
          features: { equals: binding.features },
        },
        data: { enabled, permissions: [...permissions], features: [...features] },
      });
      if (updated.count !== 1) throw new ConflictException({ code: 'SERVICE_IDENTITY_CONFLICT' });
      await transaction.auditEvent.create({
        data: {
          id: randomUUID(),
          organizationId,
          actorIdentityId,
          requestId,
          eventType: 'SERVICE_IDENTITY_UPDATED',
          action: 'update',
          resourceType: 'organization-service-identity',
          resourceId: binding.identityId,
          outcome: 'SUCCEEDED',
          metadata: {
            purpose: 'AGENT',
            enabled,
            permissions: permissions.join(','),
            features: features.join(','),
          },
        },
      });
      return transaction.organizationServiceIdentity.findUniqueOrThrow({
        where: { organizationId_purpose: { organizationId, purpose: 'AGENT' } },
        select: {
          purpose: true,
          enabled: true,
          permissions: true,
          features: true,
          updatedAt: true,
          identity: { select: { status: true } },
        },
      });
    });
  }
  public async invite(
    organizationId: string,
    identityTenantId: string,
    subject: string,
    email: string,
    role: OrganizationRole,
  ): Promise<unknown> {
    return this.prisma.transaction(async (transaction) => {
      await lockMembershipChanges(transaction, organizationId);
      const identity = await transaction.userIdentity.upsert({
        where: {
          provider_identityTenantId_subject: {
            provider: 'identity-platform',
            identityTenantId,
            subject,
          },
        },
        create: {
          id: randomUUID(),
          provider: 'identity-platform',
          identityTenantId,
          subject,
          email,
          emailVerified: false,
        },
        update: { email, status: 'ACTIVE' },
      });
      const current = await transaction.organizationMembership.findUnique({
        where: { organizationId_identityId: { organizationId, identityId: identity.id } },
      });
      await assertOwnerPreserved(transaction, organizationId, current, role, 'ACTIVE');
      return transaction.organizationMembership.upsert({
        where: { organizationId_identityId: { organizationId, identityId: identity.id } },
        create: { id: randomUUID(), organizationId, identityId: identity.id, role },
        update: { role, status: 'ACTIVE' },
        include: {
          identity: { select: { id: true, email: true, displayName: true, status: true } },
        },
      });
    });
  }
  public async updateMembership(
    organizationId: string,
    id: string,
    role: OrganizationRole,
    status: 'ACTIVE' | 'REVOKED',
  ): Promise<unknown> {
    return this.prisma.transaction(async (transaction) => {
      await lockMembershipChanges(transaction, organizationId);
      const current = await transaction.organizationMembership.findFirst({
        where: { id, organizationId },
        select: { role: true, status: true },
      });
      if (current === null) throw resourceNotFound();
      await assertOwnerPreserved(transaction, organizationId, current, role, status);
      const result = await transaction.organizationMembership.updateMany({
        where: { id, organizationId },
        data: { role, status },
      });
      if (result.count === 0)
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: 'Membership was not found.',
          details: null,
        });
      return transaction.organizationMembership.findUniqueOrThrow({ where: { id } });
    });
  }

  public async prepareAccountRemoval(
    organizationId: string,
    id: string,
  ): Promise<{ identityId: string; identityTenantId: string; subject: string }> {
    return this.prisma.transaction(async (transaction) => {
      await lockMembershipChanges(transaction, organizationId);
      const membership = await transaction.organizationMembership.findFirst({
        where: { id, organizationId },
        include: {
          identity: {
            select: { id: true, provider: true, subject: true, identityTenantId: true },
          },
          organization: { select: { identityTenantId: true } },
        },
      });
      if (membership === null) throw resourceNotFound();
      if (
        membership.identity.provider !== 'identity-platform' ||
        membership.identity.identityTenantId === null ||
        membership.identity.identityTenantId !== membership.organization.identityTenantId
      ) {
        throw new ConflictException({
          code: 'IDENTITY_TENANT_MISMATCH',
          message: 'The account is not bound to this organization Identity Platform tenant.',
          details: null,
        });
      }
      const membershipCount = await transaction.organizationMembership.count({
        where: { identityId: membership.identityId },
      });
      if (membershipCount !== 1) {
        throw new ConflictException({
          code: 'IDENTITY_MULTIPLE_ORGANIZATIONS',
          message:
            'The account has memberships in multiple organizations and requires remediation.',
          details: null,
        });
      }
      await assertOwnerPreserved(
        transaction,
        organizationId,
        membership,
        membership.role,
        'REVOKED',
      );
      await transaction.organizationMembership.update({
        where: { id },
        data: { status: 'REVOKED' },
      });
      await transaction.userIdentity.update({
        where: { id: membership.identityId },
        data: { status: 'TERMINATED' },
      });
      return {
        identityId: membership.identity.id,
        identityTenantId: membership.identity.identityTenantId,
        subject: membership.identity.subject,
      };
    });
  }

  public async completeAccountRemoval(
    organizationId: string,
    id: string,
    identityId: string,
  ): Promise<void> {
    await this.prisma.transaction(async (transaction) => {
      await lockMembershipChanges(transaction, organizationId);
      const membership = await transaction.organizationMembership.findFirst({
        where: { id, organizationId, identityId, status: 'REVOKED' },
        select: { id: true },
      });
      if (membership === null) throw resourceNotFound();
      await transaction.authorizationGroupMember.deleteMany({
        where: { identityId, group: { organizationId } },
      });
      await transaction.catalogAccessGrant.deleteMany({ where: { organizationId, identityId } });
      await transaction.organizationMembership.delete({ where: { id } });
      await transaction.userIdentity.update({
        where: { id: identityId },
        data: {
          subject: `deleted:${identityId}`,
          email: null,
          displayName: null,
          emailVerified: false,
          status: 'TERMINATED',
        },
      });
    });
  }
  public listAuditEvents(organizationId: string, limit: number): Promise<unknown> {
    return this.prisma.client.auditEvent.findMany({
      where: { organizationId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  public listGroups(organizationId: string): Promise<unknown> {
    return this.prisma.client.authorizationGroup.findMany({
      where: { organizationId },
      include: {
        members: {
          include: { identity: { select: { id: true, email: true, displayName: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  public async createGroup(
    organizationId: string,
    name: string,
    description?: string,
  ): Promise<unknown> {
    const normalizedName = name.trim();
    if (normalizedName.length === 0 || normalizedName.length > 120) {
      throw new BadRequestException({
        code: 'INVALID_GROUP_NAME',
        message: 'Group name must contain 1 to 120 characters.',
        details: null,
      });
    }
    try {
      return await this.prisma.client.authorizationGroup.create({
        data: {
          id: randomUUID(),
          organizationId,
          name: normalizedName,
          ...(description === undefined ? {} : { description: description.trim() }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'GROUP_NAME_CONFLICT',
          message: 'A group with this name already exists in this organization.',
          details: null,
        });
      }
      throw error;
    }
  }

  public async addGroupMember(
    organizationId: string,
    groupId: string,
    identityId: string,
  ): Promise<unknown> {
    const [group, membership] = await Promise.all([
      this.prisma.client.authorizationGroup.findFirst({ where: { id: groupId, organizationId } }),
      this.prisma.client.organizationMembership.findFirst({
        where: { organizationId, identityId, status: 'ACTIVE' },
      }),
    ]);
    if (group === null || membership === null) throw resourceNotFound();
    return this.prisma.client.authorizationGroupMember.upsert({
      where: { groupId_identityId: { groupId, identityId } },
      create: { id: randomUUID(), groupId, identityId },
      update: {},
    });
  }

  public async removeGroupMember(
    organizationId: string,
    groupId: string,
    identityId: string,
  ): Promise<void> {
    const group = await this.prisma.client.authorizationGroup.findFirst({
      where: { id: groupId, organizationId },
      select: { id: true },
    });
    if (group === null) throw resourceNotFound();
    await this.prisma.client.authorizationGroupMember.deleteMany({
      where: { groupId, identityId },
    });
  }

  public async updateGroupFeatures(
    organizationId: string,
    groupId: string,
    visibleFeatures: readonly WorkspaceFeature[],
  ): Promise<unknown> {
    const result = await this.prisma.client.authorizationGroup.updateMany({
      where: { id: groupId, organizationId },
      data: { featureVisibilityConfigured: true, visibleFeatures: [...visibleFeatures] },
    });
    if (result.count === 0) throw resourceNotFound();
    return this.prisma.client.authorizationGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        members: {
          include: { identity: { select: { id: true, email: true, displayName: true } } },
        },
      },
    });
  }

  public listCatalogGrants(organizationId: string): Promise<unknown> {
    return this.prisma.client.catalogAccessGrant.findMany({
      where: { organizationId },
      include: {
        group: { select: { id: true, name: true } },
        identity: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async createCatalogGrant(
    organizationId: string,
    actorIdentityId: string,
    input: CreateCatalogGrantInput,
  ): Promise<unknown> {
    if (
      [input.groupId, input.identityId, input.agentName].filter((value) => value !== undefined)
        .length !== 1
    ) {
      throw invalidGrant('Exactly one group, identity, or agent principal is required.');
    }
    if (input.permissions.length === 0) throw invalidGrant('At least one permission is required.');
    if (
      input.expiresAt !== undefined &&
      input.validFrom !== undefined &&
      input.expiresAt <= input.validFrom
    ) {
      throw invalidGrant('Grant expiry must be after its start time.');
    }
    if (input.groupId !== undefined) {
      const group = await this.prisma.client.authorizationGroup.findFirst({
        where: { id: input.groupId, organizationId },
        select: { id: true },
      });
      if (group === null) throw resourceNotFound();
    }
    if (input.identityId !== undefined) {
      const membership = await this.prisma.client.organizationMembership.findFirst({
        where: { organizationId, identityId: input.identityId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (membership === null) throw resourceNotFound();
    }
    return this.prisma.client.catalogAccessGrant.create({
      data: {
        id: randomUUID(),
        organizationId,
        createdById: actorIdentityId,
        ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
        ...(input.identityId === undefined ? {} : { identityId: input.identityId }),
        ...(input.agentName === undefined ? {} : { agentName: input.agentName }),
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        permissions: [...input.permissions],
        effect: input.effect,
        includeDescendants: input.includeDescendants,
        grantOption: input.grantOption,
        ...(input.validFrom === undefined ? {} : { validFrom: input.validFrom }),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      },
    });
  }

  public async deleteCatalogGrant(organizationId: string, grantId: string): Promise<void> {
    const result = await this.prisma.client.catalogAccessGrant.deleteMany({
      where: { id: grantId, organizationId },
    });
    if (result.count === 0) throw resourceNotFound();
  }

  public async authorizeCatalog(
    organizationId: string,
    identityId: string,
    permission: CatalogPermission,
    hierarchy: readonly CatalogResourceRef[],
    agentName?: string,
    userBypass = false,
  ): Promise<CatalogAuthorizationDecision> {
    if (hierarchy.length === 0) return defaultDeny();
    const schemaResource = hierarchy.find((resource) => resource.type === 'SCHEMA');
    if (schemaResource !== undefined) {
      const namespace = catalogNamespaceFrom(schemaResource.id);
      if (namespace === undefined) return defaultDeny();
      const ownedNamespace = await this.prisma.client.catalogNamespaceDescription.findFirst({
        where: {
          organizationId,
          catalog: namespace.catalog,
          namespace: namespace.namespace,
        },
        select: { id: true },
      });
      // Catalog grants are organization-scoped, but their resource identifiers
      // refer to a shared physical Trino/Iceberg catalog. Without this ownership
      // check, a wildcard grant in one organization can authorize a namespace
      // created by another organization. Ownership is therefore an independent,
      // fail-closed prerequisite for every schema/table/column operation.
      if (ownedNamespace === null) return defaultDeny();
    }
    const groupMemberships = userBypass
      ? []
      : await this.prisma.client.authorizationGroupMember.findMany({
          where: { identityId, group: { organizationId } },
          select: { groupId: true },
        });
    const now = new Date();
    const resources = hierarchy.map((resource, index) => ({
      resourceType: resource.type,
      resourceId: resource.id,
      ...(index === hierarchy.length - 1 ? {} : { includeDescendants: true }),
    }));
    resources.push({
      resourceType: 'CATALOG',
      resourceId: '*',
      ...(hierarchy.length === 1 ? {} : { includeDescendants: true }),
    });
    const grants = await this.prisma.client.catalogAccessGrant.findMany({
      where: {
        organizationId,
        OR: [
          ...(userBypass
            ? []
            : [
                { identityId },
                { groupId: { in: groupMemberships.map((membership) => membership.groupId) } },
              ]),
          ...(agentName === undefined ? [] : [{ agentName }]),
        ],
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: resources },
        ],
      },
      select: { id: true, effect: true, permissions: true, agentName: true },
    });
    const matched = grants.filter(
      (grant) => grant.permissions.includes(permission) || grant.permissions.includes('OWN'),
    );
    const human = matched.filter(
      (grant) => grant.agentName === null || grant.agentName === undefined,
    );
    const agent = matched.filter((grant) => grant.agentName === agentName);
    const relevant = agentName === undefined ? human : [...human, ...agent];
    const denied = relevant.filter((grant) => grant.effect === 'DENY');
    if (denied.length > 0)
      return {
        allowed: false,
        matchedGrantIds: denied.map((grant) => grant.id),
        reason: 'EXPLICIT_DENY',
      };
    const humanAllowed = userBypass || human.some((grant) => grant.effect === 'ALLOW');
    const agentAllowed = agentName === undefined || agent.some((grant) => grant.effect === 'ALLOW');
    return humanAllowed && agentAllowed
      ? {
          allowed: true,
          matchedGrantIds: relevant
            .filter((grant) => grant.effect === 'ALLOW')
            .map((grant) => grant.id),
          reason: 'EXPLICIT_ALLOW',
        }
      : defaultDeny();
  }
}

function catalogNamespaceFrom(
  schemaId: string,
): { readonly catalog: string; readonly namespace: string } | undefined {
  const separator = schemaId.indexOf('.');
  if (separator <= 0 || separator === schemaId.length - 1) return undefined;
  return {
    catalog: schemaId.slice(0, separator),
    namespace: schemaId.slice(separator + 1),
  };
}

function resourceNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'RESOURCE_NOT_FOUND',
    message: 'The authorization resource was not found in this organization.',
    details: null,
  });
}

async function lockMembershipChanges(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  // Serialize both invitations and role/status edits per organization. The lock
  // is transaction-scoped, so a failed write cannot retain it or race the count.
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`organization-memberships:${organizationId}`}, 0))::text`;
}

async function assertOwnerPreserved(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  current: { role: string; status: string } | null,
  role: OrganizationRole,
  status: string,
): Promise<void> {
  if (
    current?.role !== 'ORG_OWNER' ||
    current.status !== 'ACTIVE' ||
    (role === 'ORG_OWNER' && status === 'ACTIVE')
  )
    return;
  const owners = await transaction.organizationMembership.count({
    where: { organizationId, role: 'ORG_OWNER', status: 'ACTIVE' },
  });
  if (owners <= 1)
    throw new BadRequestException({
      code: 'LAST_ORGANIZATION_OWNER',
      message: 'The final active organization owner cannot be removed or suspended.',
      details: null,
    });
}

function invalidGrant(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_CATALOG_GRANT', message, details: null });
}

function defaultDeny(): CatalogAuthorizationDecision {
  return { allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' };
}

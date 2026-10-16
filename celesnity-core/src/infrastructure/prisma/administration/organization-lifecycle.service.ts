import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@generated/prisma/client';
import { AGENT_MCP_FEATURES } from '@application/administration/mcp-operation-policy';

const BACKGROUND_FEATURES = ['EXECUTIONS', 'CRAWLER', 'AUTOMATIONS', 'DEVICES'];
// MCP capabilities are provisioned from the server-owned tool registry.
// Human feature checks and catalog grants remain independent restrictions.

export interface OrganizationBootstrapInput {
  readonly organizationId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly homeRegion: string;
  readonly identityTenantId: string;
  readonly ownerSubject?: string;
  readonly ownerEmail?: string;
}

/** Trusted, transactional enrollment; never called from a public request. */
export class OrganizationLifecycleService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async bootstrap(input: OrganizationBootstrapInput): Promise<void> {
    // Concurrent identical Jobs can race on the organization or owner unique
    // index. Retry the whole transaction; a conflicting record is still rejected
    // by the validation below, never overwritten.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.bootstrapOnce(input);
        return;
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
        if (attempt === 2 || (code !== 'P2002' && code !== 'P2034')) throw error;
      }
    }
  }

  private async bootstrapOnce(input: OrganizationBootstrapInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.organization.findUnique({
        where: { id: input.organizationId },
      });
      // An earlier versioned migration creates this placeholder. On a fresh
      // schema it must receive its owner before another organization is added.
      // An already-enrolled organization can coexist with an older, unowned
      // placeholder; that placeholder must not block idempotent verification.
      if (existing === null) {
        const unownedPlaceholder = await transaction.organization.findFirst({
          where: {
            slug: 'celesnity-bootstrap',
            status: 'ACTIVE',
            memberships: { none: { role: 'ORG_OWNER', status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (unownedPlaceholder !== null) {
          throw new Error('The existing bootstrap organization must receive its first owner');
        }
      }
      if (
        existing !== null &&
        (existing.slug !== input.slug ||
          existing.displayName !== input.displayName ||
          existing.homeRegion !== input.homeRegion ||
          existing.status !== 'ACTIVE' ||
          (existing.identityTenantId !== null &&
            existing.identityTenantId !== input.identityTenantId))
      )
        throw new Error('Bootstrap organization conflicts with the approved configuration');

      const organization =
        existing ??
        (await transaction.organization.create({
          data: {
            id: input.organizationId,
            slug: input.slug,
            displayName: input.displayName,
            homeRegion: input.homeRegion,
            identityTenantId: input.identityTenantId,
          },
        }));
      if (organization.identityTenantId === null) {
        await transaction.organization.update({
          where: { id: input.organizationId },
          data: { identityTenantId: input.identityTenantId },
        });
      }

      for (const purpose of ['BACKGROUND', 'AGENT'] as const) {
        await this.ensureServiceIdentity(transaction, input.organizationId, purpose);
      }

      if ((input.ownerSubject === undefined) !== (input.ownerEmail === undefined)) {
        throw new Error('Bootstrap owner subject and email must be provided together');
      }
      const activeOwnerCount = await transaction.organizationMembership.count({
        where: { organizationId: input.organizationId, role: 'ORG_OWNER', status: 'ACTIVE' },
      });
      if (activeOwnerCount > 0) {
        // A populated organization may already have several reviewed owners.
        // Deployment must not nominate or replace one just to run migrations.
        if (input.ownerSubject !== undefined && input.ownerEmail !== undefined) {
          const matchingOwner = await transaction.organizationMembership.findFirst({
            where: {
              organizationId: input.organizationId,
              role: 'ORG_OWNER',
              status: 'ACTIVE',
              identity: {
                provider: 'identity-platform',
                identityTenantId: input.identityTenantId,
                subject: input.ownerSubject,
                email: input.ownerEmail,
                status: 'ACTIVE',
              },
            },
            select: { id: true },
          });
          if (matchingOwner === null)
            throw new Error('Approved bootstrap owner does not match an active owner');
        }
        if (organization.identityTenantId === null) {
          await transaction.auditEvent.create({
            data: {
              id: randomUUID(),
              organizationId: input.organizationId,
              eventType: 'ORGANIZATION_BOOTSTRAPPED',
              action: 'bootstrap',
              resourceType: 'organization',
              resourceId: input.organizationId,
              outcome: 'SUCCEEDED',
              metadata: { source: 'deployment-job', existingOwners: true },
            },
          });
        }
        return;
      }

      if (input.ownerSubject === undefined || input.ownerEmail === undefined) {
        throw new Error('First-owner identifiers are required for an unowned organization');
      }

      const owner = await transaction.userIdentity.findUnique({
        where: {
          provider_identityTenantId_subject: {
            provider: 'identity-platform',
            identityTenantId: input.identityTenantId,
            subject: input.ownerSubject,
          },
        },
      });
      if (owner !== null && (owner.status !== 'ACTIVE' || owner.email !== input.ownerEmail)) {
        throw new Error('Bootstrap owner conflicts with the approved configuration');
      }
      const ownerId = owner?.id ?? randomUUID();
      if (owner !== null) {
        const otherOrganization = await transaction.organizationMembership.findFirst({
          where: {
            identityId: ownerId,
            organizationId: { not: input.organizationId },
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (otherOrganization !== null) {
          throw new Error('Bootstrap owner is already active in another organization');
        }
      }
      const existingOwner = await transaction.organizationMembership.findFirst({
        where: {
          organizationId: input.organizationId,
          role: 'ORG_OWNER',
          status: 'ACTIVE',
        },
        select: { identityId: true },
      });
      // Never install a new owner into an organization that already has one.
      // Multiple existing owners are valid; the approved owner must already
      // have an active owner membership among them.
      if (existingOwner !== null && owner === null) {
        throw new Error('Approved bootstrap owner is not an existing organization owner');
      }
      if (owner === null)
        await transaction.userIdentity.create({
          data: {
            id: ownerId,
            provider: 'identity-platform',
            subject: input.ownerSubject,
            identityTenantId: input.identityTenantId,
            email: input.ownerEmail,
            emailVerified: false,
          },
        });
      const membership = await transaction.organizationMembership.findUnique({
        where: {
          organizationId_identityId: { organizationId: input.organizationId, identityId: ownerId },
        },
      });
      if (
        membership !== null &&
        (membership.role !== 'ORG_OWNER' || membership.status !== 'ACTIVE')
      ) {
        throw new Error('Bootstrap owner membership conflicts with the approved configuration');
      }
      if (existingOwner !== null && membership === null) {
        throw new Error('Approved bootstrap owner is not an existing organization owner');
      }
      if (membership === null)
        await transaction.organizationMembership.create({
          data: {
            id: randomUUID(),
            organizationId: input.organizationId,
            identityId: ownerId,
            role: 'ORG_OWNER',
          },
        });
      if (organization.identityTenantId === null || owner === null || membership === null) {
        await transaction.auditEvent.create({
          data: {
            id: randomUUID(),
            organizationId: input.organizationId,
            eventType: 'ORGANIZATION_BOOTSTRAPPED',
            action: 'bootstrap',
            resourceType: 'organization',
            resourceId: input.organizationId,
            outcome: 'SUCCEEDED',
            metadata: { source: 'deployment-job', ownerIdentityId: ownerId },
          },
        });
      }
    });
  }

  private async ensureServiceIdentity(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    purpose: 'BACKGROUND' | 'AGENT',
  ): Promise<void> {
    const existing = await transaction.organizationServiceIdentity.findUnique({
      where: { organizationId_purpose: { organizationId, purpose } },
    });
    if (existing !== null) return; // Never reactivate or widen a revoked identity.
    const identityId = randomUUID();
    await transaction.userIdentity.create({
      data: {
        id: identityId,
        provider: 'organization-service',
        subject: `${purpose.toLowerCase()}:${organizationId}`,
        identityTenantId: `service:${organizationId}`,
        displayName: `Organization ${purpose.toLowerCase()} service`,
      },
    });
    await transaction.organizationMembership.create({
      data: { id: randomUUID(), organizationId, identityId, role: 'SERVICE_ACCOUNT' },
    });
    await transaction.organizationServiceIdentity.create({
      data: {
        organizationId,
        purpose,
        identityId,
        enabled: true,
        permissions: ['workspace:read', 'workspace:write'],
        features: purpose === 'BACKGROUND' ? BACKGROUND_FEATURES : [...AGENT_MCP_FEATURES],
      },
    });
    await transaction.auditEvent.create({
      data: {
        id: randomUUID(),
        organizationId,
        eventType: 'SERVICE_IDENTITY_PROVISIONED',
        action: 'provision',
        resourceType: 'organization-service-identity',
        resourceId: identityId,
        outcome: 'SUCCEEDED',
        metadata: { purpose, source: 'organization-lifecycle' },
      },
    });
  }
}

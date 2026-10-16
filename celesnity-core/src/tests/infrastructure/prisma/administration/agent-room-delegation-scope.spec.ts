import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@generated/prisma/client';
import { AuthenticatedContextStore, type AuthenticatedContext } from '@application/administration/authenticated-context';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import { PrismaAgentRoomDelegationRepository } from '@infrastructure/prisma/administration/prisma-agent-room-delegation.repository';

jest.mock('@generated/prisma/client', () => ({ PrismaClient: jest.fn() }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

const runId = '40000000-0000-4000-8000-000000000001';
function machinePrincipal(): AuthenticatedContext {
  return {
    organizationId: 'default-organization', identityId: 'machine-identity',
    subject: 'machine', identityTenantId: 'service', organizationStatus: 'ACTIVE',
    membershipId: 'machine-membership', role: 'SERVICE_ACCOUNT',
    mfaRequired: false, mfaVerified: false, authenticationTime: 0,
    servicePermissions: ['workspace:read'], visibleFeatures: ['DOCUMENTS'],
  };
}

describe('room delegation across the machine organization boundary', () => {
  function harness() {
    const contexts = new AuthenticatedContextStore();
    contexts.configureAgentResolver(async (org) => ({
      ...machinePrincipal(), organizationId: org,
    }));
    const binding = {
      organizationId: 'room-organization',
      agentName: 'chat-assistant',
      mfaVerifiedUntil: new Date(Date.now() + 60_000) as Date | null,
      organization: { status: 'ACTIVE', identityTenantId: 'tenant-a', mfaRequired: true },
      boundBy: {
        id: 'identity-a',
        subject: 'subject-a',
        identityTenantId: 'tenant-a',
        status: 'ACTIVE',
        email: null,
        memberships: [
          { id: 'membership-a', organizationId: 'room-organization', role: 'ORG_OWNER' },
        ],
      },
    };
    type Args = {
      where: { roomId: string; organizationId?: string; boundBy?: { subject: string } };
    };
    const read = jest.fn(async ({ where }: Args) => {
      if (
        where.roomId !== 'room-a' ||
        (where.organizationId !== undefined && where.organizationId !== binding.organizationId) ||
        (where.boundBy !== undefined && where.boundBy.subject !== binding.boundBy.subject)
      )
        return null;
      return binding;
    });
    type Operation = (input: {
      model: string;
      operation: string;
      args: Args;
      query: typeof read;
    }) => Promise<unknown>;
    jest.mocked(PrismaClient).mockImplementation(
      () =>
        ({
          agentRoomBinding: { findFirst: read },
          agentRunScope: { findUnique: jest.fn().mockResolvedValue({
            runId, roomId: 'room-a', organizationId: 'room-organization',
            boundById: 'identity-a', agentName: 'chat-assistant',
            schema: null, catalog: null, closedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
          }) },
          $extends: (extension: { query: { $allModels: { $allOperations: Operation } } }) => ({
            agentRoomBinding: {
              findUnique: (args: Args) =>
                extension.query.$allModels.$allOperations({
                  model: 'AgentRoomBinding',
                  operation: 'findUnique',
                  args,
                  query: read,
                }),
            },
          }),
        }) as unknown as PrismaClient,
    );
    const prisma = new PrismaService(
      new ConfigService({
        DATABASE_URL: 'postgresql://unused',
        DEFAULT_ORGANIZATION_ID: 'default-organization',
      }),
      new PrismaTransactionContext(),
      contexts,
    );
    const repository = new PrismaAgentRoomDelegationRepository(prisma);
    const delegation = new AgentRoomDelegationService(repository, contexts, { write: jest.fn().mockResolvedValue(undefined) }, 'iceberg');
    return { contexts, binding, prisma, repository, delegation };
  }

  it('resolves a non-default room, scopes the tool to its organization, and restores machine scope', async () => {
    const { contexts, prisma, delegation } = harness();
    await contexts.run(machinePrincipal(), async () => {
      await expect(
        prisma.client.agentRoomBinding.findUnique({ where: { roomId: 'room-a' } }),
      ).resolves.toBeNull();
      await expect(
        delegation.runForFeature(
          'room-a',
          'subject-a',
          'DOCUMENTS',
          async () => {
            expect(contexts.require().organizationId).toBe('room-organization');
            return prisma.client.agentRoomBinding.findUnique({ where: { roomId: 'room-a' } });
          },
          'workspace:read',
          'chat-assistant',
          runId,
        ),
      ).resolves.toMatchObject({ organizationId: 'room-organization' });
      expect(contexts.require().organizationId).toBe('default-organization');
    });
  });

  it('rejects an incorrect caller and a missing room without executing the tool', async () => {
    const { contexts, delegation } = harness();
    const work = jest.fn();
    await contexts.run(machinePrincipal(), async () => {
      await expect(delegation.runForFeature('room-a', 'wrong-subject', 'DOCUMENTS', work, 'workspace:read', 'chat-assistant', runId)).rejects.toThrow(
        'delegation is invalid',
      );
      await expect(delegation.runForFeature('missing-room', 'subject-a', 'DOCUMENTS', work, 'workspace:read', 'chat-assistant', runId)).rejects.toThrow(
        'delegation is invalid',
      );
    });
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects a binding without a current active membership', async () => {
    const { binding, contexts, delegation } = harness();
    binding.boundBy.memberships = [];
    const work = jest.fn();
    await expect(
      contexts.run(machinePrincipal(), () =>
        delegation.run(
          'room-a',
          'subject-a',
          work,
          { permission: 'workspace:read', anyFeature: ['DOCUMENTS'] },
          'chat-assistant',
          runId,
        ),
      ),
    ).rejects.toThrow('delegation is invalid');
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects expired or absent MFA assurance for an MFA-required organization', async () => {
    const { binding, contexts, delegation } = harness();
    const work = jest.fn();
    binding.mfaVerifiedUntil = new Date(Date.now() - 1);
    await expect(
      contexts.run(machinePrincipal(), () =>
        delegation.run(
          'room-a',
          'subject-a',
          work,
          { permission: 'workspace:read', anyFeature: ['DOCUMENTS'] },
          'chat-assistant',
          runId,
        ),
      ),
    ).rejects.toThrow('MFA_REQUIRED');
    binding.mfaVerifiedUntil = null;
    await expect(
      contexts.run(machinePrincipal(), () =>
        delegation.run(
          'room-a',
          'subject-a',
          work,
          { permission: 'workspace:read', anyFeature: ['DOCUMENTS'] },
          'chat-assistant',
          runId,
        ),
      ),
    ).rejects.toThrow('MFA_REQUIRED');
    expect(work).not.toHaveBeenCalled();
  });
});

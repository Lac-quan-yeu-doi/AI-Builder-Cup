import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaAgentRoomDelegationRepository } from '@infrastructure/prisma/administration/prisma-agent-room-delegation.repository';

const organizationA = '20000000-0000-4000-8000-000000000001';
const organizationB = '20000000-0000-4000-8000-000000000002';

function activeBinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizationId: organizationA,
    agentName: 'chat-assistant',
    mfaVerifiedUntil: null,
    organization: {
      status: 'ACTIVE',
      identityTenantId: 'tenant-a',
      mfaRequired: false,
    },
    boundBy: {
      id: '10000000-0000-4000-8000-000000000001',
      subject: 'subject-a',
      identityTenantId: 'tenant-a',
      email: 'owner@example.test',
      status: 'ACTIVE',
      memberships: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          organizationId: organizationA,
          role: 'ORG_OWNER',
        },
      ],
    },
    ...overrides,
  };
}

function repositoryWith(binding: Record<string, unknown> | null): {
  repository: PrismaAgentRoomDelegationRepository;
  findUnique: jest.Mock;
} {
  const findUnique = jest.fn().mockResolvedValue(binding);
  const prisma = {
    findAgentRoomDelegationBinding: findUnique,
  } as unknown as PrismaService;
  return { repository: new PrismaAgentRoomDelegationRepository(prisma), findUnique };
}

describe('PrismaAgentRoomDelegationRepository', () => {
  it('requires the automation step to belong to the claimed organization and agent', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new PrismaAgentRoomDelegationRepository({
      client: { automationWorkflowStepRun: { findFirst } },
    } as unknown as PrismaService);
    await expect(
      repository.automationRunBelongsToOrganization('run-1', organizationA, 'chat-assistant'),
    ).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        agentRunId: 'run-1',
        status: 'running',
        run: { status: 'running', workflow: { organizationId: organizationA } },
        step: { agentId: 'chat-assistant' },
      },
      select: { id: true },
    });
  });

  it('derives the tenant and identity from the persisted room binding', async () => {
    const { repository } = repositoryWith(activeBinding());

    await expect(repository.resolve('room-a', 'subject-a')).resolves.toMatchObject({
      organizationId: organizationA,
      subject: 'subject-a',
      role: 'ORG_OWNER',
    });
  });

  it('carries verified MFA only until the bounded assurance expires', async () => {
    const organization = { status: 'ACTIVE', identityTenantId: 'tenant-a', mfaRequired: true };
    const { repository } = repositoryWith(
      activeBinding({ organization, mfaVerifiedUntil: new Date(Date.now() + 60_000) }),
    );
    await expect(repository.resolve('room-a', 'subject-a')).resolves.toMatchObject({
      mfaRequired: true,
      mfaVerified: true,
    });
    const { repository: expired } = repositoryWith(
      activeBinding({ organization, mfaVerifiedUntil: new Date(Date.now() - 1) }),
    );
    await expect(expired.resolve('room-a', 'subject-a')).resolves.toMatchObject({
      mfaRequired: true,
      mfaVerified: false,
    });
  });

  it('rejects legacy room bindings without a selected agent until renewed', async () => {
    const { repository } = repositoryWith(activeBinding({ agentName: null }));
    await expect(repository.resolve('room-a', 'subject-a')).resolves.toBeUndefined();
  });

  it('rejects a caller-subject swap', async () => {
    const { repository } = repositoryWith(activeBinding());

    await expect(repository.resolve('room-a', 'subject-b')).resolves.toBeUndefined();
  });

  it('rejects a membership from another tenant', async () => {
    const binding = activeBinding();
    const boundBy = binding.boundBy as { memberships: Array<Record<string, unknown>> };
    boundBy.memberships[0] = {
      ...boundBy.memberships[0],
      organizationId: organizationB,
    };
    const { repository } = repositoryWith(binding);

    await expect(repository.resolve('room-a', 'subject-a')).resolves.toBeUndefined();
  });

  it('rejects inactive organizations and identities', async () => {
    const inactiveOrganization = activeBinding({
      organization: { status: 'SUSPENDED', identityTenantId: 'tenant-a', mfaRequired: false },
    });
    const { repository: organizationRepository } = repositoryWith(inactiveOrganization);
    await expect(organizationRepository.resolve('room-a', 'subject-a')).resolves.toBeUndefined();

    const inactiveIdentity = activeBinding();
    (inactiveIdentity.boundBy as { status: string }).status = 'DISABLED';
    const { repository: identityRepository } = repositoryWith(inactiveIdentity);
    await expect(identityRepository.resolve('room-a', 'subject-a')).resolves.toBeUndefined();
  });
});

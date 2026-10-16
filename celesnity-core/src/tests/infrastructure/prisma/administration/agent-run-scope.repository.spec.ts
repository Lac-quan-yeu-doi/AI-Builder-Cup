import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import { PrismaAgentRoomDelegationRepository } from '@infrastructure/prisma/administration/prisma-agent-room-delegation.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

const principal = {
  organizationId: 'organization-a', identityId: 'human-a', agentName: 'chat-assistant',
} as AuthenticatedContext;
const active = {
  runId: 'run-a', roomId: 'room-a', organizationId: 'organization-a',
  boundById: 'human-a', agentName: 'chat-assistant',
  catalog: 'iceberg', schema: 'selected', closedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
};

describe('persisted Agent run scope', () => {
  const resolve = async (record: object | null, actor = principal) => {
    const findAgentRunScope = jest.fn().mockResolvedValue(record);
    const repository = new PrismaAgentRoomDelegationRepository(
      { findAgentRunScope } as unknown as PrismaService,
    );
    const decision = await repository.resolveRun('run-a', 'room-a', actor);
    expect(findAgentRunScope).toHaveBeenCalledWith('run-a');
    return decision;
  };

  it('returns the bounded database for the exact active room, actor and agent', async () => {
    await expect(resolve(active)).resolves.toEqual({ catalog: 'iceberg', schema: 'selected' });
    await expect(resolve({ ...active, catalog: null, schema: null })).resolves.toBeNull();
  });

  it.each([
    ['missing', null],
    ['wrong room', { ...active, roomId: 'room-b' }],
    ['wrong organization', { ...active, organizationId: 'organization-b' }],
    ['wrong human', { ...active, boundById: 'human-b' }],
    ['wrong agent', { ...active, agentName: 'different-agent' }],
    ['closed', { ...active, closedAt: new Date() }],
    ['expired', { ...active, expiresAt: new Date(Date.now() - 1) }],
  ])('rejects %s registrations before any data operation', async (_case, record) => {
    await expect(resolve(record)).resolves.toBeUndefined();
  });
});

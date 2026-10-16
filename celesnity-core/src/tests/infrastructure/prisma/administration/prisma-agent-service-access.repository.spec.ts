import { PrismaAgentServiceAccessRepository } from '@infrastructure/prisma/administration/prisma-agent-service-access.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('PrismaAgentServiceAccessRepository', () => {
  it.each([undefined, 'human-subject'])(
    'denies Agent access without an enabled persisted service identity even for delegated caller %s',
    async (callerSubject) => {
      const findHuman = jest.fn();
      const prisma = {
        client: {
          agentRoomBinding: {
            findUnique: jest.fn().mockResolvedValue({
              organizationId: 'organization-1',
              organization: { status: 'ACTIVE' },
            }),
          },
          userIdentity: { findFirst: findHuman },
        },
        resolveAgentIdentity: jest.fn().mockRejectedValue(new Error('disabled')),
      } as unknown as PrismaService;
      const repository = new PrismaAgentServiceAccessRepository(prisma);
      await expect(
        repository.resolveRoomPrincipal(
          'room-1',
          {
            subject: 'agent-workload',
            email: 'agent@example.test',
            authenticationTime: 1,
          },
          callerSubject,
        ),
      ).resolves.toBeNull();
      expect(prisma.resolveAgentIdentity).toHaveBeenCalledWith('organization-1');
      expect(findHuman).not.toHaveBeenCalled();
    },
  );
});

import { RoomOwnershipResolver } from '@infrastructure/automation-workflow/room-ownership-resolver';

describe('RoomOwnershipResolver', () => {
  const bindingFindFirst = jest.fn();
  const prisma = { client: { agentRoomBinding: { findFirst: bindingFindFirst } } };

  beforeEach(() => bindingFindFirst.mockReset());

  it('returns true when a binding exists for the org', async () => {
    bindingFindFirst.mockResolvedValue({ roomId: 'r1' });
    const resolver = new RoomOwnershipResolver(prisma as never);
    expect(await resolver.ownsRoom('r1', 'org-1')).toBe(true);
    expect(bindingFindFirst).toHaveBeenCalledWith({
      where: { roomId: 'r1', organizationId: 'org-1' },
      select: { roomId: true },
    });
  });

  it('returns false when no binding exists', async () => {
    bindingFindFirst.mockResolvedValue(null);
    const resolver = new RoomOwnershipResolver(prisma as never);
    expect(await resolver.ownsRoom('r1', 'org-1')).toBe(false);
  });
});

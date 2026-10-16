import { PrismaMessageBlockRepository } from '@infrastructure/prisma/message-block/prisma-message-block.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { MessageBlock } from '@domain/message-block/models/message-block';

// Unit coverage complements prisma-message-block-cursors.database.spec.ts,
// which verifies these cursor filters against an isolated PostgreSQL database.

interface StoredRow {
  id: string;
  roomId: string;
  runId: string | null;
  blockType: string;
  version: number;
  payload: unknown;
  fallbackText: string;
  publishedAt: Date;
}

function row(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    id: 'block-1',
    roomId: 'room-1',
    runId: null,
    blockType: 'text',
    version: 1,
    payload: { text: 'hi' },
    fallbackText: 'hi',
    publishedAt: new Date('2026-08-18T00:00:00.000Z'),
    ...overrides,
  };
}

function block(overrides: Partial<MessageBlock> = {}): MessageBlock {
  return {
    id: 'block-1',
    roomId: 'room-1',
    runId: null,
    blockType: 'text',
    version: 1,
    payload: { text: 'hi' },
    fallbackText: 'hi',
    publishedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('PrismaMessageBlockRepository.bindRoom', () => {
  const principal = {
    organizationId: '10000000-0000-4000-8000-000000000001',
    identityId: '20000000-0000-4000-8000-000000000001',
    mfaVerified: true,
    mfaRequired: true,
  };

  it('stores bounded MFA assurance and renews only the same room owner', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T02:00:00.000Z'));
    try {
      const upsert = jest.fn().mockResolvedValue({
        organizationId: principal.organizationId,
        boundById: principal.identityId,
        agentName: 'chat-assistant',
      });
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const prisma = {
        client: { agentRoomBinding: { upsert, updateMany } },
      } as unknown as PrismaService;
      await new PrismaMessageBlockRepository(prisma).bindRoom(
        'room-1',
        'chat-assistant',
        principal,
      );

      const expiresAt = new Date('2026-09-23T02:30:00.000Z');
      expect(upsert).toHaveBeenCalledWith({
        where: { roomId: 'room-1' },
        create: {
          roomId: 'room-1',
          organizationId: principal.organizationId,
          boundById: principal.identityId,
          agentName: 'chat-assistant',
          mfaVerifiedUntil: expiresAt,
        },
        update: {},
        select: { organizationId: true, boundById: true, agentName: true },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          roomId: 'room-1',
          organizationId: principal.organizationId,
          boundById: principal.identityId,
          OR: [{ agentName: null }, { agentName: 'chat-assistant' }],
        },
        data: { agentName: 'chat-assistant', mfaVerifiedUntil: expiresAt },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not renew a room bound to a different identity in the same organization', async () => {
    const upsert = jest.fn().mockResolvedValue({
      organizationId: principal.organizationId,
      boundById: '30000000-0000-4000-8000-000000000001',
      agentName: 'chat-assistant',
    });
    const updateMany = jest.fn();
    const prisma = {
      client: { agentRoomBinding: { upsert, updateMany } },
    } as unknown as PrismaService;
    await expect(
      new PrismaMessageBlockRepository(prisma).bindRoom('room-1', 'chat-assistant', principal),
    ).rejects.toThrow('another identity or organization');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('clears assurance when a non-MFA session renews a room', async () => {
    const upsert = jest.fn().mockResolvedValue({
      organizationId: principal.organizationId,
      boundById: principal.identityId,
      agentName: 'chat-assistant',
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      client: { agentRoomBinding: { upsert, updateMany } },
    } as unknown as PrismaService;
    await new PrismaMessageBlockRepository(prisma).bindRoom('room-1', 'chat-assistant', {
      ...principal,
      mfaVerified: false,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { agentName: 'chat-assistant', mfaVerifiedUntil: null } }),
    );
  });
});

describe('PrismaMessageBlockRepository.create', () => {
  it('writes the block fields and maps the row back to the domain shape', async () => {
    const create = jest.fn().mockResolvedValue(row());
    const prisma = { client: { messageBlock: { create } } } as unknown as PrismaService;
    const repository = new PrismaMessageBlockRepository(prisma);

    const created = await repository.create(block());

    expect(create).toHaveBeenCalledWith({
      data: {
        id: 'block-1',
        roomId: 'room-1',
        runId: null,
        blockType: 'text',
        version: 1,
        payload: { text: 'hi' },
        fallbackText: 'hi',
        publishedAt: '2026-08-18T00:00:00.000Z',
      },
    });
    expect(created).toEqual(block());
  });
});

describe('PrismaMessageBlockRepository.listByRoom', () => {
  it.each(['', 'not-a-uuid', '40000000-0000-4000-8000-000000000004'])(
    'rejects an unreplayable cursor %s rather than returning empty history',
    async (cursor) => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        client: { messageBlock: { findFirst, findMany } },
      } as unknown as PrismaService;
      await expect(
        new PrismaMessageBlockRepository(prisma).listByRoom(
          'room-1',
          '10000000-0000-4000-8000-000000000001',
          cursor,
          50,
        ),
      ).rejects.toMatchObject({ code: 'MESSAGE_BLOCK_CURSOR_INVALID' });
      expect(findMany).not.toHaveBeenCalled();
      if (cursor.includes('40000000'))
        expect(findFirst).toHaveBeenCalledWith({
          where: {
            id: cursor,
            roomId: 'room-1',
            organizationId: '10000000-0000-4000-8000-000000000001',
          },
          select: { id: true },
        });
    },
  );
  it('orders oldest first and maps every row back to the domain shape', async () => {
    const rows = [row({ id: 'block-1' }), row({ id: 'block-2' })];
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { client: { messageBlock: { findMany } } } as unknown as PrismaService;
    const repository = new PrismaMessageBlockRepository(prisma);

    const listed = await repository.listByRoom(
      'room-1',
      '10000000-0000-4000-8000-000000000001',
      undefined,
      50,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        roomId: 'room-1',
        organizationId: '10000000-0000-4000-8000-000000000001',
      },
      orderBy: { publishedAt: 'asc' },
      take: 50,
    });
    expect(listed.map((b) => b.id)).toEqual(['block-1', 'block-2']);
  });

  it('passes cursor and limit through as Prisma cursor-based pagination', async () => {
    const findMany = jest.fn().mockResolvedValue([row({ id: 'block-2' })]);
    const prisma = {
      client: {
        messageBlock: {
          findMany,
          findFirst: jest.fn().mockResolvedValue({ id: '40000000-0000-4000-8000-000000000004' }),
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaMessageBlockRepository(prisma);

    await repository.listByRoom(
      'room-1',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000004',
      1,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        roomId: 'room-1',
        organizationId: '10000000-0000-4000-8000-000000000001',
      },
      orderBy: { publishedAt: 'asc' },
      take: 1,
      cursor: { id: '40000000-0000-4000-8000-000000000004' },
      skip: 1,
    });
  });
});

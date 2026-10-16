import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@generated/prisma/client';
import { PrismaMessageBlockRepository } from '@infrastructure/prisma/message-block/prisma-message-block.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

// Opt-in real-query contract test. Use a fresh disposable local PostgreSQL DB;
// it deliberately refuses application databases and pre-existing schemas.
const connectionString = process.env.MESSAGE_BLOCK_TEST_DATABASE_URL;
const databaseSuite = connectionString ? describe : describe.skip;
databaseSuite('Message-block cursors against isolated PostgreSQL', () => {
  let client: PrismaClient;
  let repository: PrismaMessageBlockRepository;
  let ownsSchema = false;
  const org = '10000000-0000-4000-8000-000000000001';
  const otherOrg = '10000000-0000-4000-8000-000000000002';
  const first = '40000000-0000-4000-8000-000000000001';
  const last = '40000000-0000-4000-8000-000000000002';
  const foreignRoom = '40000000-0000-4000-8000-000000000003';
  const foreignOrg = '40000000-0000-4000-8000-000000000004';
  beforeAll(async () => {
    if (!connectionString) throw new Error('Missing isolated test database URL');
    const url = new URL(connectionString);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/message_block_recovery_test'
    ) {
      throw new Error(
        'Cursor tests require the disposable local message_block_recovery_test database',
      );
    }
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await client.$executeRawUnsafe('CREATE SCHEMA celesnity_app');
    ownsSchema = true;
    await client.$executeRawUnsafe(`CREATE TABLE celesnity_app.message_blocks (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, room_id varchar(255) NOT NULL,
      run_id varchar(255), block_type varchar(30) NOT NULL, version integer NOT NULL DEFAULT 1,
      payload jsonb NOT NULL, fallback_text text NOT NULL, published_at timestamptz NOT NULL
    )`);
    await client.messageBlock.createMany({
      data: [
        {
          id: first,
          organizationId: org,
          roomId: 'room',
          blockType: 'text',
          payload: {},
          fallbackText: 'first',
          publishedAt: new Date('2026-10-01T00:00:00Z'),
        },
        {
          id: last,
          organizationId: org,
          roomId: 'room',
          blockType: 'text',
          payload: {},
          fallbackText: 'last',
          publishedAt: new Date('2026-10-01T00:00:01Z'),
        },
        {
          id: foreignRoom,
          organizationId: org,
          roomId: 'other-room',
          blockType: 'text',
          payload: {},
          fallbackText: 'foreign room',
          publishedAt: new Date('2026-10-01T00:00:02Z'),
        },
        {
          id: foreignOrg,
          organizationId: otherOrg,
          roomId: 'room',
          blockType: 'text',
          payload: {},
          fallbackText: 'foreign organization',
          publishedAt: new Date('2026-10-01T00:00:03Z'),
        },
      ],
    });
    repository = new PrismaMessageBlockRepository({ client } as unknown as PrismaService);
  }, 20_000);
  afterAll(async () => {
    try {
      if (ownsSchema) await client.$executeRawUnsafe('DROP SCHEMA celesnity_app CASCADE');
    } finally {
      await client?.$disconnect();
    }
  });
  it('distinguishes empty valid replay from unavailable cursors', async () => {
    expect(await repository.listByRoom('room', org, undefined, 50)).toEqual([
      expect.objectContaining({ id: first }),
      expect.objectContaining({ id: last }),
    ]);
    expect(await repository.listByRoom('room', org, first, 50)).toEqual([
      expect.objectContaining({ id: last }),
    ]);
    expect(await repository.listByRoom('room', org, last, 50)).toEqual([]);
    expect(await repository.listByRoom('empty-room', org, undefined, 50)).toEqual([]);
  });
  it.each(['', 'malformed', '40000000-0000-4000-8000-000000000099', foreignRoom, foreignOrg])(
    'uniformly rejects missing, malformed or inaccessible anchor %s',
    async (cursor) => {
      await expect(repository.listByRoom('room', org, cursor, 50)).rejects.toMatchObject({
        code: 'MESSAGE_BLOCK_CURSOR_INVALID',
      });
    },
  );
  it('delivers every block exactly once when publication timestamps are identical', async () => {
    const ids = [
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000003',
    ];
    await client.messageBlock.createMany({
      data: ids.map((id) => ({
        id,
        organizationId: org,
        roomId: 'same-time',
        blockType: 'text',
        payload: {},
        fallbackText: id,
        publishedAt: new Date('2026-10-01T00:00:00Z'),
      })),
    });
    let cursor: string | undefined;
    const delivered: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const page = await repository.listByRoom('same-time', org, cursor, 1);
      if (!page[0]) break;
      delivered.push(page[0].id);
      cursor = page[0].id;
    }
    expect(delivered).toEqual(ids);
  });
  it('signals a deleted anchor instead of treating it as caught up', async () => {
    await client.messageBlock.delete({ where: { id: last } });
    await expect(repository.listByRoom('room', org, last, 50)).rejects.toMatchObject({
      code: 'MESSAGE_BLOCK_CURSOR_INVALID',
    });
  });
});

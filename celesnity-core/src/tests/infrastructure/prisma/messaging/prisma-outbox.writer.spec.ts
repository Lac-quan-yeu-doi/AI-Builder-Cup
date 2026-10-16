import type { OutboxMessage } from '@application/shared/outbox-message';
import { PrismaOutboxWriter } from '@infrastructure/prisma/messaging/prisma-outbox.writer';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * The outbox writer's job is small but exact: turn staged messages into rows whose
 * shape the relay can read back.
 *
 * Two details are load-bearing and easy to get wrong:
 *
 *  - `id` must be the domain event's own id, because that is what makes redelivery
 *    idempotent — the primary key rejects a duplicate insert, and a consumer
 *    deduplicates on the same value.
 *  - `available_at` must be set, or the relay's `available_at <= now` predicate
 *    would never match and the message would never be claimed.
 */

interface CreateManyCall {
  readonly data: readonly Record<string, unknown>[];
}

function stubPrisma(calls: CreateManyCall[]): PrismaService {
  return {
    client: {
      outboxEvent: {
        createMany: (call: CreateManyCall): Promise<{ count: number }> => {
          calls.push(call);
          return Promise.resolve({ count: call.data.length });
        },
      },
    },
  } as unknown as PrismaService;
}

const OCCURRED_AT = new Date('2026-08-04T10:00:00.000Z');

function message(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationId: '22222222-2222-4222-8222-222222222222',
    aggregateType: 'Script',
    aggregateId: '33333333-3333-4333-8333-333333333333',
    eventName: 'ScriptCreated',
    payload: { scriptId: '33333333-3333-4333-8333-333333333333' },
    occurredAt: OCCURRED_AT,
    ...overrides,
  };
}

describe('PrismaOutboxWriter.append', () => {
  it('issues no statement for an empty batch', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([]);

    expect(calls).toEqual([]);
  });

  it('inserts one row per message in a single statement', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([
      message({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      message({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.data).toHaveLength(2);
  });

  it('uses the domain event id as the row id, which is what makes redelivery idempotent', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([message()]);

    expect(calls[0]?.data[0]?.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('sets availableAt so the relay can claim the message immediately', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([message()]);

    expect(calls[0]?.data[0]?.availableAt).toEqual(OCCURRED_AT);
    expect(calls[0]?.data[0]?.occurredAt).toEqual(OCCURRED_AT);
  });

  it('carries the aggregate type and name the relay dispatches on', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([message()]);

    expect(calls[0]?.data[0]?.aggregateType).toBe('Script');
    expect(calls[0]?.data[0]?.eventName).toBe('ScriptCreated');
  });

  it('serializes a Date in the payload to an ISO string Prisma will accept', async () => {
    // A raw Date in a JSON column is rejected by Prisma, so the payload is
    // normalized to what will come back out of the column on read.
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([
      message({ payload: { at: OCCURRED_AT } }),
    ]);

    expect(calls[0]?.data[0]?.payload).toEqual({ at: '2026-08-04T10:00:00.000Z' });
  });

  it('drops an undefined payload property rather than letting Prisma reject it', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([
      message({ payload: { present: 1, absent: undefined } }),
    ]);

    expect(calls[0]?.data[0]?.payload).toEqual({ present: 1 });
  });

  it('preserves an explicit null, which is meaningful in a payload', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([
      message({ payload: { exitCode: null } }),
    ]);

    expect(calls[0]?.data[0]?.payload).toEqual({ exitCode: null });
  });

  it('preserves nested payload structure', async () => {
    const calls: CreateManyCall[] = [];

    await new PrismaOutboxWriter(stubPrisma(calls)).append([
      message({ payload: { outer: { inner: [1, 2] } } }),
    ]);

    expect(calls[0]?.data[0]?.payload).toEqual({ outer: { inner: [1, 2] } });
  });
});

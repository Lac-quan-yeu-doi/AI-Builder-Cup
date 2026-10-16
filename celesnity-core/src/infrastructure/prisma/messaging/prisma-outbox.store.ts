import { Injectable } from '@nestjs/common';

import { Prisma } from '@generated/prisma/client';
import { OutboxStatus } from '@generated/prisma/enums';
import type {
  OutboxDeliveryFailure,
  PendingOutboxMessage,
  IOutboxStore,
} from '@application/shared/interfaces/i-outbox-store';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/** The row shape the claim statement returns. */
interface ClaimedRow {
  readonly id: string;
  readonly organization_id: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly event_name: string;
  readonly payload: unknown;
  readonly occurred_at: Date;
  readonly attempts: number;
}

/**
 * Prisma-backed {@link IOutboxStore}.
 *
 * The claim is hand-written SQL, and that is a considered exception rather than a
 * lapse. Claiming from a queue requires `FOR UPDATE SKIP LOCKED` combined with
 * `RETURNING`, so that concurrent relays step over each other's rows instead of
 * blocking, and so the claimer learns *which* rows it won. Prisma's `updateMany`
 * reports only a count and has no row limit, so expressing this through the query
 * builder would mean either one statement per message or an extra column to tag
 * ownership — both worse than being explicit.
 *
 * This is not the same situation as the execution dispatcher, which also used raw
 * SQL and was rewritten. There, the SQL was mutating an aggregate's status behind
 * its own state machine. Here there is no aggregate: the outbox is infrastructure
 * plumbing, the row has no invariants beyond its own status column, and no domain
 * rule is being bypassed. Every other operation is an ordinary bounded update and
 * uses the query builder.
 */
@Injectable()
export class PrismaOutboxStore implements IOutboxStore {
  public constructor(private readonly prisma: PrismaService) {}

  public async claimDue(limit: number, now: Date): Promise<readonly PendingOutboxMessage[]> {
    if (limit < 1) {
      return [];
    }

    const rows = await this.prisma.client.$queryRaw<ClaimedRow[]>(Prisma.sql`
      UPDATE celesnity_app.outbox_events o
      SET status = ${OutboxStatus.PROCESSING}::celesnity_app."OutboxStatus",
          updated_at = ${now}
      WHERE o.id IN (
        SELECT id
        FROM celesnity_app.outbox_events
        WHERE status = ${OutboxStatus.PENDING}::celesnity_app."OutboxStatus"
          AND available_at <= ${now}
        ORDER BY occurred_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING o.id, o.organization_id, o.aggregate_type, o.aggregate_id, o.event_name,
                o.payload, o.occurred_at, o.attempts
    `);

    // `RETURNING` follows the update's own order, not the subquery's, so the
    // caller's "oldest first" expectation is restored here.
    return rows
      .map((row) => this.toMessage(row))
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  }

  public async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.client.outboxEvent.updateMany({
      where: { id: { in: [...ids] } },
      data: { status: OutboxStatus.PUBLISHED, publishedAt, lastError: null },
    });
  }

  public async recordFailures(failures: readonly OutboxDeliveryFailure[]): Promise<void> {
    // Per-message updates because each carries its own attempt count, retry time
    // and error text; there is no shared `data` to batch on.
    for (const failure of failures) {
      await this.prisma.client.outboxEvent.updateMany({
        where: { id: failure.id },
        data: {
          // An exhausted message is parked rather than deleted: it is the only
          // record that something was produced and never delivered.
          status: failure.exhausted ? OutboxStatus.FAILED : OutboxStatus.PENDING,
          attempts: failure.attempts,
          availableAt: failure.retryAt,
          lastError: failure.error,
        },
      });
    }
  }

  public async releaseStaleClaims(claimedBefore: Date): Promise<number> {
    const result = await this.prisma.client.outboxEvent.updateMany({
      where: { status: OutboxStatus.PROCESSING, updatedAt: { lt: claimedBefore } },
      data: { status: OutboxStatus.PENDING },
    });
    return result.count;
  }

  public async purgePublishedBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.client.outboxEvent.deleteMany({
      where: { status: OutboxStatus.PUBLISHED, publishedAt: { lt: cutoff } },
    });
    return result.count;
  }

  private toMessage(row: ClaimedRow): PendingOutboxMessage {
    return {
      id: row.id,
      organizationId: row.organization_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventName: row.event_name,
      payload: asPayload(row.payload),
      occurredAt: row.occurred_at,
      // Postgres `int4` arrives as a number, but a driver returning a string for a
      // numeric column is a common enough footgun to normalize rather than trust.
      attempts: Number(row.attempts),
    };
  }
}

function asPayload(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Readonly<Record<string, unknown>>;
}

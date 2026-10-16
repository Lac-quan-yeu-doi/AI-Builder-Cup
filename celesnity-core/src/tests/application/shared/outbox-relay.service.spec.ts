import type { IIntegrationEventPublisher } from '@application/shared/interfaces/i-integration-event-publisher';
import type {
  OutboxDeliveryFailure,
  PendingOutboxMessage,
  IOutboxStore,
} from '@application/shared/interfaces/i-outbox-store';
import type { OutboxMessage } from '@application/shared/outbox-message';
import {
  OutboxRelayService,
  type OutboxRelayConfig,
  type OutboxRelayLogger,
} from '@application/shared/outbox-relay.service';
import { FixedClock } from '@tests/support/deterministic-ports';

/**
 * The outbox relay, which is entirely new: the outbox previously had a writer and
 * no reader, so nothing was ever delivered and nothing was ever purged.
 *
 * The behaviours worth pinning down are the ones that decide whether a message is
 * eventually delivered or silently lost:
 *
 *  - a failure isolated to one message must not block the rest of the batch;
 *  - a retry must be deferred with growing backoff, and the growth must be capped;
 *  - the attempt budget must eventually park a message rather than retry forever;
 *  - claims abandoned by a crashed relay must become eligible again.
 */

const NOW = '2026-08-04T10:00:00.000Z';

function message(id: string, attempts = 0): PendingOutboxMessage {
  return {
    id,
    organizationId: '77777777-7777-4777-8777-777777777777',
    aggregateType: 'Script',
    aggregateId: '88888888-8888-4888-8888-888888888888',
    eventName: 'ScriptCreated',
    payload: { scriptId: '88888888-8888-4888-8888-888888888888' },
    occurredAt: new Date(NOW),
    attempts,
  };
}

class FakeStore implements IOutboxStore {
  public batches: PendingOutboxMessage[][] = [];
  public published: string[] = [];
  public failures: OutboxDeliveryFailure[] = [];
  public released = 0;
  public purged = 0;
  public releasedBefore: Date | undefined;
  public purgedBefore: Date | undefined;
  public claimLimits: number[] = [];

  public claimDue(limit: number): Promise<readonly PendingOutboxMessage[]> {
    this.claimLimits.push(limit);
    return Promise.resolve(this.batches.shift() ?? []);
  }

  public markPublished(ids: readonly string[]): Promise<void> {
    this.published.push(...ids);
    return Promise.resolve();
  }

  public recordFailures(failures: readonly OutboxDeliveryFailure[]): Promise<void> {
    this.failures.push(...failures);
    return Promise.resolve();
  }

  public releaseStaleClaims(claimedBefore: Date): Promise<number> {
    this.releasedBefore = claimedBefore;
    return Promise.resolve(this.released);
  }

  public purgePublishedBefore(cutoff: Date): Promise<number> {
    this.purgedBefore = cutoff;
    return Promise.resolve(this.purged);
  }
}

class FakePublisher implements IIntegrationEventPublisher {
  public readonly delivered: string[] = [];
  public failFor = new Set<string>();

  public publish(outboxMessage: OutboxMessage): Promise<void> {
    if (this.failFor.has(outboxMessage.id)) {
      return Promise.reject(new Error(`broker refused ${outboxMessage.id}`));
    }
    this.delivered.push(outboxMessage.id);
    return Promise.resolve();
  }
}

const SILENT_LOGGER: OutboxRelayLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const CONFIG: OutboxRelayConfig = {
  batchSize: 10,
  maxAttempts: 3,
  baseBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  claimTimeoutMs: 60_000,
  retentionMs: 7 * 24 * 60 * 60 * 1_000,
};

interface Harness {
  readonly relay: OutboxRelayService;
  readonly store: FakeStore;
  readonly publisher: FakePublisher;
  readonly clock: FixedClock;
}

function harness(config: Partial<OutboxRelayConfig> = {}): Harness {
  const store = new FakeStore();
  const publisher = new FakePublisher();
  const clock = new FixedClock(NOW);
  return {
    relay: new OutboxRelayService(store, publisher, clock, { ...CONFIG, ...config }, SILENT_LOGGER),
    store,
    publisher,
    clock,
  };
}

describe('OutboxRelayService.drain', () => {
  it('does nothing when the queue is empty', async () => {
    const { relay, store } = harness();

    await expect(relay.drain()).resolves.toEqual({ claimed: 0, published: 0, failed: 0 });
    expect(store.published).toEqual([]);
    expect(store.failures).toEqual([]);
  });

  it('publishes a full batch and marks it published in one call', async () => {
    const { relay, store, publisher } = harness();
    store.batches = [[message('a'), message('b')]];

    const result = await relay.drain();

    expect(result).toEqual({ claimed: 2, published: 2, failed: 0 });
    expect(publisher.delivered).toEqual(['a', 'b']);
    expect(store.published).toEqual(['a', 'b']);
  });

  it('claims at most the configured batch size', async () => {
    const { relay, store } = harness({ batchSize: 25 });
    store.batches = [[]];

    await relay.drain();

    expect(store.claimLimits).toEqual([25]);
  });

  it('delivers the rest of the batch when one message fails', async () => {
    // One bad payload must not hold up everything queued behind it.
    const { relay, store, publisher } = harness();
    store.batches = [[message('a'), message('bad'), message('c')]];
    publisher.failFor = new Set(['bad']);

    const result = await relay.drain();

    expect(result).toEqual({ claimed: 3, published: 2, failed: 1 });
    expect(store.published).toEqual(['a', 'c']);
    expect(store.failures.map((failure) => failure.id)).toEqual(['bad']);
  });

  it('does not mark a failed message published', async () => {
    const { relay, store, publisher } = harness();
    store.batches = [[message('bad')]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.published).toEqual([]);
  });

  it('records the failure reason so an operator can see why delivery failed', async () => {
    const { relay, store, publisher } = harness();
    store.batches = [[message('bad')]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.failures[0]?.error).toContain('broker refused bad');
  });
});

describe('OutboxRelayService retry scheduling', () => {
  it('increments the attempt count past what was already recorded', async () => {
    const { relay, store, publisher } = harness();
    store.batches = [[message('bad', 2)]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.failures[0]?.attempts).toBe(3);
  });

  it('defers the first retry by the base backoff', async () => {
    const { relay, store, publisher } = harness();
    store.batches = [[message('bad', 0)]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.failures[0]?.retryAt).toEqual(new Date('2026-08-04T10:00:01.000Z'));
  });

  it('doubles the backoff on each subsequent attempt', async () => {
    const { relay, store, publisher } = harness();
    store.batches = [[message('bad', 2)]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    // attempts becomes 3, so the delay is base * 2^2 = 4s.
    expect(store.failures[0]?.retryAt).toEqual(new Date('2026-08-04T10:00:04.000Z'));
  });

  it('caps the backoff, so accumulated attempts cannot defer a message for days', async () => {
    const { relay, store, publisher } = harness({ maxAttempts: 50 });
    store.batches = [[message('bad', 30)]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.failures[0]?.retryAt).toEqual(new Date('2026-08-04T10:00:10.000Z'));
  });

  it('keeps a message retryable while attempts remain', async () => {
    const { relay, store, publisher } = harness({ maxAttempts: 3 });
    store.batches = [[message('bad', 1)]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.failures[0]?.exhausted).toBe(false);
  });

  it('parks a message once the attempt budget is spent', async () => {
    const { relay, store, publisher } = harness({ maxAttempts: 3 });
    store.batches = [[message('bad', 2)]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.failures[0]?.exhausted).toBe(true);
  });

  it('treats an already over-budget message as exhausted rather than retrying it', async () => {
    const { relay, store, publisher } = harness({ maxAttempts: 3 });
    store.batches = [[message('bad', 9)]];
    publisher.failFor = new Set(['bad']);

    await relay.drain();

    expect(store.failures[0]?.exhausted).toBe(true);
  });
});

describe('OutboxRelayService maintenance', () => {
  it('releases claims older than the claim timeout', async () => {
    const { relay, store } = harness({ claimTimeoutMs: 60_000 });
    store.released = 4;

    await expect(relay.recoverStaleClaims()).resolves.toBe(4);
    expect(store.releasedBefore).toEqual(new Date('2026-08-04T09:59:00.000Z'));
  });

  it('purges delivered messages older than the retention window', async () => {
    const { relay, store } = harness({ retentionMs: 24 * 60 * 60 * 1_000 });
    store.purged = 12;

    await expect(relay.purgeDelivered()).resolves.toBe(12);
    expect(store.purgedBefore).toEqual(new Date('2026-08-03T10:00:00.000Z'));
  });

  it('moves both cutoffs as the clock advances', async () => {
    const { relay, store, clock } = harness();
    clock.advanceBy(60 * 60 * 1_000);

    await relay.recoverStaleClaims();

    expect(store.releasedBefore).toEqual(new Date('2026-08-04T10:59:00.000Z'));
  });
});

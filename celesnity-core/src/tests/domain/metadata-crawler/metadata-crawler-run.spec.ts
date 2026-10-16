import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import { MetadataCrawlerRunStatus } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

const NOW = new Date('2026-08-18T01:00:00.000Z');
const LEASE = new Date('2026-08-18T01:30:00.000Z');
const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

function queuedRun(): MetadataCrawlerRun {
  return MetadataCrawlerRun.queue({
    id: RUN_ID,
    crawlerId: CRAWLER_ID,
    triggerType: 'MANUAL',
    deduplicationKey: 'manual:33333333-3333-4333-8333-333333333333',
    queuedAt: NOW,
    crawlerRevision: 1,
    connectorTypeSnapshot: 'POSTGRESQL',
    safeConfigSnapshot: { includeSchemas: ['public'] },
  });
}

function counters() {
  return {
    databaseCount: 1,
    schemaCount: 2,
    relationCount: 4,
    columnCount: 20,
    createdCount: 4,
    updatedCount: 0,
    unchangedCount: 0,
    deletedCount: 0,
    warningCount: 0,
  };
}

describe('MetadataCrawlerRun', () => {
  it('permits only QUEUED -> RUNNING -> PARTIAL as a partial terminal path', () => {
    const run = queuedRun();

    run.start({ workerId: 'crawler-worker-1', leaseExpiresAt: LEASE }, NOW);
    run.finishPartial(counters(), NOW);

    expect(run.status).toBe(MetadataCrawlerRunStatus.PARTIAL);
    expect(run.attempt).toBe(1);
    expect(run.workerId).toBe('crawler-worker-1');
    expect(() => run.start({ workerId: 'other', leaseExpiresAt: LEASE }, NOW)).toThrow();
  });

  it('accepts heartbeats only from the current worker while running', () => {
    const run = queuedRun();
    run.start({ workerId: 'crawler-worker-1', leaseExpiresAt: LEASE }, NOW);

    expect(run.heartbeat('other-worker', new Date('2026-08-18T01:45:00.000Z'), NOW)).toBe(false);
    expect(run.heartbeat('crawler-worker-1', new Date('2026-08-18T01:45:00.000Z'), NOW)).toBe(true);
    expect(run.leaseExpiresAt?.toISOString()).toBe('2026-08-18T01:45:00.000Z');
  });

  it('requeues a running run after its lease expires', () => {
    const run = queuedRun();
    run.start({ workerId: 'crawler-worker-1', leaseExpiresAt: LEASE }, NOW);

    run.requeueAfterLeaseExpiry(new Date('2026-08-18T01:31:00.000Z'));

    expect(run.status).toBe(MetadataCrawlerRunStatus.QUEUED);
    expect(run.workerId).toBeUndefined();
    expect(run.leaseExpiresAt).toBeUndefined();
    expect(run.attempt).toBe(1);
  });
});

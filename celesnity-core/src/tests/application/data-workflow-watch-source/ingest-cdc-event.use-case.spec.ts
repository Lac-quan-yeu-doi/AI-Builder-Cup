import { IngestCdcEventUseCase } from '@application/data-workflow-watch-source/ingest-cdc-event.use-case';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { CdcMetadataEvent } from '@domain/data-workflow-watch-source/models/cdc-event';
import { FixedClock } from '@tests/support/deterministic-ports';

const EVENT: CdcMetadataEvent = {
  connectorId: 'connector',
  organizationId: 'org',
  databaseServiceId: 'source',
  relation: { schema: 'public', table: 'orders' },
  operation: 'INSERT',
  positionFingerprint: 'sha256:fingerprint',
  committedAt: new Date('2026-09-18T09:00:00.000Z'),
  topic: 'cdc',
  partition: 0,
  offset: '7',
};

describe('IngestCdcEventUseCase', () => {
  it('passes the event and the injected clock instant to the repository', async () => {
    const now = new Date('2026-09-18T09:01:00.000Z');
    const repository = {
      ingestCdcEvent: jest.fn().mockResolvedValue({
        duplicate: false,
        matchedSources: 2,
        windowIds: ['window-1'],
      }),
    } as unknown as IWatchSourceRepository;
    const useCase = new IngestCdcEventUseCase(repository, new FixedClock(now));

    await expect(useCase.execute(EVENT)).resolves.toEqual({
      duplicate: false,
      matchedSources: 2,
      windowIds: ['window-1'],
    });
    expect(repository.ingestCdcEvent).toHaveBeenCalledWith(EVENT, now);
  });
});

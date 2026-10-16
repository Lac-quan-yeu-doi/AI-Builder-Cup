import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';

const NOW = new Date('2026-08-18T01:00:00.000Z');
const NEXT_RUN = new Date('2026-08-19T01:00:00.000Z');
const DATABASE_SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';

function activeCrawler(): MetadataCrawler {
  return MetadataCrawler.create({
    id: CRAWLER_ID,
    databaseServiceId: DATABASE_SERVICE_ID,
    name: 'Orders crawler',
    serviceFamily: 'DATABASE',
    scheduleCron: '0 1 * * *',
    scheduleTimezone: 'UTC',
    nextRunAt: NEXT_RUN,
    discoveryConfig: {
      includeSchemas: ['public'],
      includeViews: false,
    },
    now: NOW,
  });
}

describe('MetadataCrawler', () => {
  it('increments revision when schedule configuration changes', () => {
    const crawler = activeCrawler();

    crawler.reconfigure({ scheduleCron: '0 2 * * *', scheduleTimezone: 'Asia/Ho_Chi_Minh' }, NOW);

    expect(crawler.revision).toBe(2);
    expect(crawler.scheduleCron).toBe('0 2 * * *');
    expect(crawler.scheduleTimezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('archives without erasing the database-service assignment', () => {
    const crawler = activeCrawler();

    crawler.archive(NOW);

    expect(crawler.isArchived).toBe(true);
    expect(crawler.databaseServiceId).toBe(DATABASE_SERVICE_ID);
    expect(crawler.enabled).toBe(false);
  });

  it('restores an archived crawler without changing its assignment', () => {
    const crawler = activeCrawler();
    crawler.archive(NOW);

    crawler.restore(NOW);

    expect(crawler.isArchived).toBe(false);
    expect(crawler.databaseServiceId).toBe(DATABASE_SERVICE_ID);
    expect(crawler.enabled).toBe(true);
  });
});

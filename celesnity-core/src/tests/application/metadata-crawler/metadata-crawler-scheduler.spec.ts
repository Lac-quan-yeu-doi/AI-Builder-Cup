import { CronMetadataCrawlerSchedule } from '@infrastructure/scheduling/cron-metadata-crawler-schedule';

describe('CronMetadataCrawlerSchedule', () => {
  const schedule = new CronMetadataCrawlerSchedule();

  it('calculates the next occurrence in Asia/Ho_Chi_Minh', () => {
    expect(
      schedule.next('0 1 * * *', 'Asia/Ho_Chi_Minh', new Date('2026-08-18T12:00:00Z')),
    ).toEqual(new Date('2026-08-18T18:00:00.000Z'));
  });

  it('does not duplicate a repeated local instant across DST', () => {
    const first = schedule.next('30 1 * * *', 'America/New_York', new Date('2026-11-01T04:00:00Z'));
    const second = schedule.next('30 1 * * *', 'America/New_York', first);

    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it('rejects malformed expressions without exposing the raw schedule', () => {
    expect(() => schedule.next('not a cron secret=abc', 'UTC', new Date())).toThrow(
      expect.objectContaining({ code: 'INVALID_SCHEDULE' }),
    );
    expect(() => schedule.next('not a cron secret=abc', 'UTC', new Date())).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining('secret=abc') }),
    );
  });

  it('compiles and describes a daily local-time schedule', () => {
    expect(
      schedule.compile({ cadence: 'DAILY', timeOfDay: '01:05', timezone: 'Asia/Ho_Chi_Minh' }),
    ).toEqual({ expression: '5 1 * * *', timezone: 'Asia/Ho_Chi_Minh' });
    expect(schedule.describe('5 1 * * *', 'Asia/Ho_Chi_Minh')).toEqual({
      cadence: 'DAILY',
      timeOfDay: '01:05',
      timezone: 'Asia/Ho_Chi_Minh',
      editable: true,
    });
  });

  it('keeps legacy non-daily schedules explicitly custom', () => {
    expect(schedule.describe('*/15 * * * *', 'UTC')).toEqual({
      cadence: 'CUSTOM',
      expression: '*/15 * * * *',
      timezone: 'UTC',
      editable: false,
    });
  });

  it('rejects invalid daily times and timezones', () => {
    expect(() =>
      schedule.compile({ cadence: 'DAILY', timeOfDay: '24:00', timezone: 'UTC' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_SCHEDULE' }));
    expect(() =>
      schedule.compile({ cadence: 'DAILY', timeOfDay: '01:00', timezone: 'Not/AZone' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_SCHEDULE' }));
  });

  it('resolves a daily schedule across a daylight-saving transition', () => {
    expect(
      schedule.next('0 3 * * *', 'America/New_York', new Date('2026-03-08T06:59:00.000Z')),
    ).toEqual(new Date('2026-03-08T07:00:00.000Z'));
  });
});

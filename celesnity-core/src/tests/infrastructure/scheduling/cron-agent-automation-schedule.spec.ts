import { CronAgentAutomationSchedule } from '@infrastructure/scheduling/cron-agent-automation-schedule';

describe('CronAgentAutomationSchedule', () => {
  const schedule = new CronAgentAutomationSchedule();

  it('computes the next occurrence of a daily cron expression in UTC', () => {
    const next = schedule.next('0 9 * * *', 'UTC', new Date('2026-09-01T10:00:00.000Z'));
    expect(next.toISOString()).toBe('2026-09-02T09:00:00.000Z');
  });

  it('respects a non-UTC timezone', () => {
    const next = schedule.next(
      '0 9 * * *',
      'America/New_York',
      new Date('2026-09-01T00:00:00.000Z'),
    );
    // 09:00 America/New_York on 2026-09-01 is 13:00 UTC (EDT, UTC-4)
    expect(next.toISOString()).toBe('2026-09-01T13:00:00.000Z');
  });

  it('throws on an invalid cron expression', () => {
    expect(() => schedule.next('not a cron expression', 'UTC', new Date())).toThrow();
  });

  it('throws on an invalid timezone', () => {
    expect(() => schedule.next('0 9 * * *', 'Not/A_Timezone', new Date())).toThrow();
  });
});

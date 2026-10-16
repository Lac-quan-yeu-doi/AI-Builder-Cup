import { CronWorkflowTriggerSchedule } from '@infrastructure/data-workflow/cron-workflow-trigger-schedule';

describe('CronWorkflowTriggerSchedule', () => {
  const schedule = new CronWorkflowTriggerSchedule();

  it('calculates the next calendar occurrence in its IANA timezone', () => {
    expect(
      schedule.next(
        {
          type: 'CALENDAR',
          timeOfDay: '07:00',
          weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          timezone: 'Asia/Ho_Chi_Minh',
        },
        new Date('2026-09-18T00:01:00.000Z'),
      ),
    ).toEqual(new Date('2026-09-19T00:00:00.000Z'));
  });

  it('uses the fixed UTC anchor and skips missed interval occurrences', () => {
    expect(
      schedule.next(
        { type: 'INTERVAL', everySeconds: 10, anchorAt: '2026-09-18T00:00:00.000Z' },
        new Date('2026-09-18T00:00:25.000Z'),
      ),
    ).toEqual(new Date('2026-09-18T00:00:30.000Z'));

    expect(
      schedule.next(
        { type: 'INTERVAL', everySeconds: 10, anchorAt: '2026-09-18T00:00:00.000Z' },
        new Date('2026-09-17T23:59:45.000Z'),
      ),
    ).toEqual(new Date('2026-09-18T00:00:00.000Z'));
  });

  it('skips nonexistent local calendar times and fires a repeated local time once', () => {
    expect(
      schedule.next(
        {
          type: 'CALENDAR',
          timeOfDay: '02:30',
          weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          timezone: 'America/New_York',
        },
        new Date('2026-03-08T06:59:00.000Z'),
      ),
    ).toEqual(new Date('2026-03-09T06:30:00.000Z'));

    const first = schedule.next(
      {
        type: 'CALENDAR',
        timeOfDay: '01:30',
        weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        timezone: 'America/New_York',
      },
      new Date('2026-11-01T04:00:00.000Z'),
    );
    const second = schedule.next(
      {
        type: 'CALENDAR',
        timeOfDay: '01:30',
        weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        timezone: 'America/New_York',
      },
      first,
    );
    expect(first).toEqual(new Date('2026-11-01T05:30:00.000Z'));
    expect(second).toEqual(new Date('2026-11-02T06:30:00.000Z'));
  });
});

import { CronExpressionParser } from 'cron-parser';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import type {
  DailyMetadataCrawlerSchedule,
  IMetadataCrawlerSchedule,
  MetadataCrawlerScheduleView,
} from '@application/metadata-crawler/interfaces/i-metadata-crawler-schedule';

const DAILY_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const DAILY_CRON = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/u;

export class CronMetadataCrawlerSchedule implements IMetadataCrawlerSchedule {
  public compile(input: DailyMetadataCrawlerSchedule): { expression: string; timezone: string } {
    if (input.cadence !== 'DAILY' || !DAILY_TIME.test(input.timeOfDay)) {
      throw MetadataCrawlerError.invalidSchedule();
    }
    requireTimezone(input.timezone);
    const [hour, minute] = input.timeOfDay.split(':');
    return { expression: `${Number(minute)} ${Number(hour)} * * *`, timezone: input.timezone };
  }

  public describe(expression: string, timezone: string): MetadataCrawlerScheduleView {
    requireTimezone(timezone);
    const match = DAILY_CRON.exec(expression.trim());
    if (match !== null) {
      const minute = Number(match[1]);
      const hour = Number(match[2]);
      if (minute >= 0 && minute <= 59 && hour >= 0 && hour <= 23) {
        return {
          cadence: 'DAILY',
          timeOfDay: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          timezone,
          editable: true,
        };
      }
    }
    return { cadence: 'CUSTOM', expression, timezone, editable: false };
  }

  public next(expression: string, timezone: string, after: Date): Date {
    try {
      requireTimezone(timezone);
      return CronExpressionParser.parse(expression, {
        currentDate: after,
        tz: timezone,
      })
        .next()
        .toDate();
    } catch {
      // The raw expression may contain credentials or other operator secrets;
      // expose only a stable domain error to logs and HTTP callers.
      throw MetadataCrawlerError.invalidSchedule();
    }
  }
}

function requireTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    throw MetadataCrawlerError.invalidSchedule();
  }
}

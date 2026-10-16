import { CronExpressionParser } from 'cron-parser';

import type { IAgentAutomationSchedule } from '@application/automation/interfaces/i-agent-automation-schedule';

export class CronAgentAutomationSchedule implements IAgentAutomationSchedule {
  public next(cronExpression: string, timezone: string, after: Date): Date {
    requireTimezone(timezone);
    try {
      return CronExpressionParser.parse(cronExpression, { currentDate: after, tz: timezone })
        .next()
        .toDate();
    } catch {
      throw new Error(`Invalid cron expression "${cronExpression}" or timezone "${timezone}"`);
    }
  }
}

function requireTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error(`Invalid timezone "${timezone}"`);
  }
}

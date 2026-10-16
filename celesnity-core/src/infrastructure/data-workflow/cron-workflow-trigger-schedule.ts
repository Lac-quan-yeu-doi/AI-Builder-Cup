import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import type { WorkflowCalendarTrigger } from '@domain/data-workflow/models/workflow-trigger';
import { nextWorkflowOccurrence } from '@domain/data-workflow/services/next-workflow-occurrence';
import { workflowCalendarCronExpression } from '@domain/data-workflow/services/workflow-calendar';
import { CronExpressionParser } from 'cron-parser';

/**
 * cron-parser uses IANA zones and returns UTC dates. Its spring-forward behavior
 * lands a missing wall-clock time on the first existing time after the gap, so
 * we explicitly reject that non-matching candidate and advance once more.
 */
export class CronWorkflowTriggerSchedule implements IWorkflowTriggerSchedule {
  public next(trigger: Parameters<IWorkflowTriggerSchedule['next']>[0], after: Date): Date {
    return nextWorkflowOccurrence(trigger, after, (calendar, current) =>
      this.nextCalendar(calendar, current),
    );
  }

  private nextCalendar(trigger: WorkflowCalendarTrigger, after: Date): Date {
    const cronExpression = workflowCalendarCronExpression(trigger);
    let current = after;
    for (let attempts = 0; attempts < 3; attempts += 1) {
      const expression = CronExpressionParser.parse(`0 ${cronExpression}`, {
        currentDate: current,
        strict: true,
        tz: trigger.timezone,
      });
      const candidate = expression.next().toDate();
      if (expression.includesDate(candidate)) {
        return candidate;
      }
      current = candidate;
    }
    throw new Error('Could not resolve a valid calendar workflow trigger occurrence.');
  }
}

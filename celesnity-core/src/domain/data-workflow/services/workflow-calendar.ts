import type { WorkflowCalendarTrigger, WorkflowWeekday } from '@domain/data-workflow/models/workflow-trigger';

const CRON_WEEKDAY: Readonly<Record<WorkflowWeekday, number>> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 0,
};

/** Converts the validated product calendar fields into an infrastructure cron expression. */
export function workflowCalendarCronExpression(trigger: WorkflowCalendarTrigger): string {
  const [hour, minute] = trigger.timeOfDay.split(':').map(Number);
  const weekdays = trigger.weekdays.map((weekday) => CRON_WEEKDAY[weekday]).join(',');
  return `${minute} ${hour} * * ${weekdays}`;
}

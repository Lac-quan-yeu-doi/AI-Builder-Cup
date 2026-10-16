export interface IAgentAutomationSchedule {
  next(cronExpression: string, timezone: string, after: Date): Date;
}

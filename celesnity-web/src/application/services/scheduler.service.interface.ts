export interface ScheduledTask {
  cancel(): void;
}

export interface SchedulerService {
  every(intervalMs: number, task: () => void): ScheduledTask;
}

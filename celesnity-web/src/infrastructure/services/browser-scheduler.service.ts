import type {
  ScheduledTask,
  SchedulerService,
} from '@/src/application/services/scheduler.service.interface';

export class BrowserSchedulerService implements SchedulerService {
  public every(intervalMs: number, task: () => void): ScheduledTask {
    const timer = setInterval(task, intervalMs);
    let active = true;

    return {
      cancel: () => {
        if (!active) {
          return;
        }
        active = false;
        clearInterval(timer);
      },
    };
  }
}

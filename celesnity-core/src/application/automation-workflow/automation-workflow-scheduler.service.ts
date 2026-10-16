import type { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';

// Mirrors AutomationSchedulerService's AutomationSchedulerLogger: the
// application layer stays framework-agnostic (no-restricted-imports blocks
// @nestjs/common here), and the module factory passes in a real Nest Logger.
export interface AutomationWorkflowSchedulerLogger {
  error(message: string): void;
}

export class AutomationWorkflowSchedulerService {
  public constructor(
    private readonly useCases: AutomationWorkflowUseCases,
    private readonly batchSize: number,
    private readonly logger: AutomationWorkflowSchedulerLogger,
  ) {}

  public async tick(): Promise<number> {
    const now = new Date();
    const due = await this.useCases.claimDueSchedules(this.batchSize, now);
    for (const workflow of due) {
      try {
        await this.useCases.dispatchScheduledWorkflow(workflow, now);
      } catch (error) {
        this.logger.error(
          `Scheduled dispatch failed for automation workflow ${workflow.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return due.length;
  }
}

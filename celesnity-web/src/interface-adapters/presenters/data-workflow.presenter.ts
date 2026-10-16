import type { DataWorkflow, DataWorkflowPage } from '@/src/entities/models/data-workflow';

export type DataWorkflowViewModel = DataWorkflow;
export type DataWorkflowPageViewModel = DataWorkflowPage;

export function presentDataWorkflow(workflow: DataWorkflow): DataWorkflowViewModel {
  return {
    ...workflow,
    ...(workflow.schedule === undefined
      ? {}
      : {
          schedule: {
            ...workflow.schedule,
            occurrenceCoverage: { ...workflow.schedule.occurrenceCoverage },
          },
        }),
  };
}

export function presentDataWorkflowPage(page: DataWorkflowPage): DataWorkflowPageViewModel {
  return { ...page, items: page.items.map(presentDataWorkflow) };
}

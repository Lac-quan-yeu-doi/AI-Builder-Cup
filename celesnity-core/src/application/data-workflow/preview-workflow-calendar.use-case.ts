import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import {
  automaticTrigger,
  parseWorkflowGraph,
} from '@application/data-workflow/workflow-graph-input';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { WorkflowCalendarTrigger } from '@domain/data-workflow/models/workflow-trigger';

export type WorkflowSchedulePreviewSource = 'DRAFT' | 'PUBLISHED';

export interface PreviewWorkflowCalendarInput {
  readonly source: WorkflowSchedulePreviewSource;
  readonly count: number;
}

export interface WorkflowCalendarPreview {
  readonly source: WorkflowSchedulePreviewSource;
  readonly trigger: WorkflowCalendarTrigger;
  readonly occurrences: readonly Date[];
}

/** Produces a bounded, read-authorized calendar preview without exposing parser details. */
export class PreviewWorkflowCalendarUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly access: IWorkflowAccess,
    private readonly triggerSchedule: IWorkflowTriggerSchedule,
    private readonly clock: IClock,
  ) {}

  public async execute(
    actor: WorkflowActor,
    workflowId: string,
    input: PreviewWorkflowCalendarInput,
  ): Promise<WorkflowCalendarPreview> {
    if (!isPreviewInput(input)) throw WorkflowAuthoringError.invalidGraph();
    await this.access.require(actor, 'READ', workflowId);
    const workflow = await this.workflows.find(workflowId);
    if (workflow === undefined || workflow.organizationId !== actor.organizationId) {
      throw WorkflowAuthoringError.notFound();
    }

    const graph = await this.graphFor(
      workflowId,
      workflow.publishedVersion,
      workflow.draft,
      input.source,
    );
    const trigger = automaticTrigger(parseWorkflowGraph(graph));
    if (trigger?.type !== 'CALENDAR') throw WorkflowAuthoringError.invalidGraph();

    try {
      const occurrences: Date[] = [];
      let after = this.clock.now();
      for (let index = 0; index < input.count; index += 1) {
        const next = this.triggerSchedule.next(trigger, after);
        if (!isFutureInstant(next, after)) throw WorkflowAuthoringError.invalidGraph();
        occurrences.push(next);
        after = next;
      }
      return { source: input.source, trigger, occurrences };
    } catch (error) {
      if (error instanceof WorkflowAuthoringError) throw error;
      throw WorkflowAuthoringError.invalidGraph();
    }
  }

  private async graphFor(
    workflowId: string,
    publishedVersion: number | undefined,
    draft: unknown,
    source: WorkflowSchedulePreviewSource,
  ): Promise<unknown> {
    if (source === 'DRAFT') return draft;
    if (publishedVersion === undefined) throw WorkflowAuthoringError.notFound();
    const version = await this.workflows.findVersion(workflowId, publishedVersion);
    if (version === undefined || version.workflowId !== workflowId)
      throw WorkflowAuthoringError.notFound();
    return version.graph;
  }
}

function isPreviewInput(input: PreviewWorkflowCalendarInput): boolean {
  return (
    (input.source === 'DRAFT' || input.source === 'PUBLISHED') &&
    Number.isSafeInteger(input.count) &&
    input.count >= 1 &&
    input.count <= 20
  );
}

function isFutureInstant(candidate: Date, after: Date): boolean {
  return (
    Number.isFinite(candidate.getTime()) &&
    Number.isFinite(after.getTime()) &&
    candidate.getTime() > after.getTime()
  );
}

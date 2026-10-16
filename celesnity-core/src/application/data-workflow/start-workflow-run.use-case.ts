import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { WorkflowRunError } from '@application/data-workflow/workflow-run.error';
import type { WorkflowJson } from '@domain/data-workflow/models/workflow-persistence';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

export interface StartWorkflowRunInput {
  readonly actor: WorkflowActor;
  readonly workflowId: string;
  readonly parameters: unknown;
  readonly delegation?: unknown;
}

export interface StartedWorkflowRun {
  readonly runId: string;
  readonly status: 'QUEUED';
}

export class StartWorkflowRunUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly runs: IWorkflowRunRepository,
    private readonly access: IWorkflowAccess,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
  ) {}

  public async execute(input: StartWorkflowRunInput): Promise<StartedWorkflowRun> {
    const { actor, workflowId } = input;
    await this.access.require(actor, 'RUN', workflowId);
    const workflow = await this.workflows.find(workflowId);
    if (workflow === undefined || workflow.organizationId !== actor.organizationId) {
      throw WorkflowRunError.notFound();
    }
    if (workflow.publishedVersion === undefined) throw WorkflowRunError.notPublished();
    const version = await this.workflows.findVersion(workflow.id, workflow.publishedVersion);
    if (version === undefined || version.organizationId !== actor.organizationId) {
      throw WorkflowRunError.notPublished();
    }
    const parameters = workflowJson(input.parameters);
    const delegation = input.delegation === undefined ? undefined : workflowJson(input.delegation);
    // This is only a useful early response. The partial unique index remains the
    // authority when two requests cross this check concurrently.
    if ((await this.runs.findActive(workflow.id)) !== undefined) {
      throw WorkflowRunError.activeRunConflict();
    }
    const created = await this.runs.createRun({
      id: this.ids.next(),
      organizationId: actor.organizationId,
      workflowId: workflow.id,
      versionId: version.id,
      actor: actor.identityId,
      delegation,
      parameters,
      triggerContext: {},
      now: this.clock.now(),
    });
    if (created === false) throw WorkflowRunError.activeRunConflict();
    return { runId: created.id, status: 'QUEUED' };
  }
}

export function workflowJson(value: unknown): WorkflowJson {
  if (!isJsonObject(value, new Set<object>(), 0)) throw WorkflowRunError.invalidParameters();
  return value;
}

function isJsonObject(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
): value is WorkflowJson {
  if (depth > 32 || typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  if ((prototype !== Object.prototype && prototype !== null) || ancestors.has(value)) return false;
  ancestors.add(value);
  for (const child of Object.values(value)) {
    const scalar =
      child === null ||
      typeof child === 'string' ||
      typeof child === 'boolean' ||
      (typeof child === 'number' && Number.isFinite(child));
    if (!scalar && !isJsonObject(child, ancestors, depth + 1)) {
      ancestors.delete(value);
      return false;
    }
  }
  ancestors.delete(value);
  return true;
}

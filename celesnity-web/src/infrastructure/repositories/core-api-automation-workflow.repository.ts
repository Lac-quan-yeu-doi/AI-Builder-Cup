import type { AutomationWorkflowRepository } from '@/src/application/repositories/automation-workflow.repository.interface';
import type {
  AddWorkflowStepInput,
  AutomationWorkflow,
  AutomationWorkflowRun,
  AutomationWorkflowRunSummary,
  AutomationWorkflowStep,
  CreateAutomationWorkflowInput,
  TestFireWorkflowInput,
  UpdateAutomationWorkflowInput,
  UpdateWorkflowStepInput,
} from '@/src/entities/models/automation-workflow';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import {
  fromWorkflowResponse,
  fromWorkflowRunResponse,
  fromWorkflowRunSummaryResponse,
  fromWorkflowStepResponse,
  toAddWorkflowStepRequest,
  toCreateWorkflowRequest,
  toRetryWorkflowRunRequest,
  toTestFireWorkflowRequest,
  toUpdateWorkflowRequest,
  toUpdateWorkflowStepRequest,
} from '@/src/infrastructure/repositories/automation-workflow-api.mapper';

type AutomationWorkflowResponseDto = components['schemas']['AutomationWorkflowResponseDto'];
type AutomationWorkflowStepResponseDto = components['schemas']['AutomationWorkflowStepResponseDto'];
type AutomationWorkflowRunResponseDto = components['schemas']['AutomationWorkflowRunResponseDto'];
type AutomationWorkflowRunSummaryResponseDto =
  components['schemas']['AutomationWorkflowRunSummaryResponseDto'];

export class CoreApiAutomationWorkflowRepository implements AutomationWorkflowRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly AutomationWorkflow[]> {
    const response = await this.request<AutomationWorkflowResponseDto[]>('/automation-workflows', {
      method: 'GET',
    });
    return response.map(fromWorkflowResponse);
  }

  public async get(id: string): Promise<AutomationWorkflow> {
    const response = await this.request<AutomationWorkflowResponseDto>(workflowPath(id), {
      method: 'GET',
    });
    return fromWorkflowResponse(response);
  }

  public async create(input: CreateAutomationWorkflowInput): Promise<AutomationWorkflow> {
    const response = await this.request<AutomationWorkflowResponseDto>('/automation-workflows', {
      method: 'POST',
      body: JSON.stringify(toCreateWorkflowRequest(input)),
    });
    return fromWorkflowResponse(response);
  }

  public async update(
    id: string,
    input: UpdateAutomationWorkflowInput,
  ): Promise<AutomationWorkflow> {
    const response = await this.request<AutomationWorkflowResponseDto>(workflowPath(id), {
      method: 'PATCH',
      body: JSON.stringify(toUpdateWorkflowRequest(input)),
    });
    return fromWorkflowResponse(response);
  }

  public async duplicate(id: string): Promise<AutomationWorkflow> {
    const response = await this.request<AutomationWorkflowResponseDto>(
      `${workflowPath(id)}/duplicate`,
      {
        method: 'POST',
      },
    );
    return fromWorkflowResponse(response);
  }

  public remove(id: string): Promise<void> {
    return this.request<void>(workflowPath(id), { method: 'DELETE' });
  }

  public async addStep(id: string, input: AddWorkflowStepInput): Promise<AutomationWorkflowStep> {
    const response = await this.request<AutomationWorkflowStepResponseDto>(
      `${workflowPath(id)}/steps`,
      {
        method: 'POST',
        body: JSON.stringify(toAddWorkflowStepRequest(input)),
      },
    );
    return fromWorkflowStepResponse(response);
  }

  public async updateStep(
    id: string,
    stepId: string,
    input: UpdateWorkflowStepInput,
  ): Promise<AutomationWorkflowStep> {
    const response = await this.request<AutomationWorkflowStepResponseDto>(
      `${workflowPath(id)}/steps/${encodeURIComponent(stepId)}`,
      { method: 'PATCH', body: JSON.stringify(toUpdateWorkflowStepRequest(input)) },
    );
    return fromWorkflowStepResponse(response);
  }

  public removeStep(id: string, stepId: string): Promise<void> {
    return this.request<void>(`${workflowPath(id)}/steps/${encodeURIComponent(stepId)}`, {
      method: 'DELETE',
    });
  }

  public testFire(id: string, input: TestFireWorkflowInput): Promise<{ readonly runId: string }> {
    return this.request<{ readonly runId: string }>(`${workflowPath(id)}/test-fire`, {
      method: 'POST',
      body: JSON.stringify(toTestFireWorkflowRequest(input)),
    });
  }

  public async getRunStatus(id: string, runId: string): Promise<AutomationWorkflowRun> {
    const response = await this.request<AutomationWorkflowRunResponseDto>(
      `${workflowPath(id)}/runs/${encodeURIComponent(runId)}`,
      { method: 'GET' },
    );
    return fromWorkflowRunResponse(response);
  }

  public async listRuns(id: string): Promise<readonly AutomationWorkflowRunSummary[]> {
    const response = await this.request<AutomationWorkflowRunSummaryResponseDto[]>(
      `${workflowPath(id)}/runs`,
      { method: 'GET' },
    );
    return response.map(fromWorkflowRunSummaryResponse);
  }

  public retryRun(id: string, runId: string, resumeFromStep: number): Promise<void> {
    return this.request<void>(`${workflowPath(id)}/runs/${encodeURIComponent(runId)}/retry`, {
      method: 'POST',
      body: JSON.stringify(toRetryWorkflowRunRequest(resumeFromStep)),
    });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function workflowPath(id: string): string {
  return `/automation-workflows/${encodeURIComponent(id)}`;
}

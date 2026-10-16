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
import type { Document } from '@/src/entities/models/document';
import type { components } from '@/src/infrastructure/api/generated/schema';

type GeneratedAutomationWorkflowResponseDto =
  components['schemas']['AutomationWorkflowResponseDto'];
type AutomationWorkflowResponseDto = Omit<
  GeneratedAutomationWorkflowResponseDto,
  'triggerFields'
> & {
  readonly triggerFields?: GeneratedAutomationWorkflowResponseDto['triggerFields'];
};
type AutomationWorkflowStepResponseDto = components['schemas']['AutomationWorkflowStepResponseDto'];
type AutomationWorkflowRunResponseDto = components['schemas']['AutomationWorkflowRunResponseDto'];
type AutomationWorkflowDocumentResponseDto = {
  readonly id: string;
  readonly filename: string;
  readonly mime_type: string;
  readonly page_count: number;
  readonly extraction_status: 'extracted' | 'no_text_found';
  readonly chart_previews?: readonly Record<string, unknown>[];
  readonly created_at: string;
};
type AutomationWorkflowRunWithDocumentsResponseDto = AutomationWorkflowRunResponseDto & {
  readonly documents?: readonly AutomationWorkflowDocumentResponseDto[];
};
type AutomationWorkflowRunSummaryResponseDto =
  components['schemas']['AutomationWorkflowRunSummaryResponseDto'];
type CreateAutomationWorkflowRequestDto =
  components['schemas']['CreateAutomationWorkflowRequestDto'];
type UpdateAutomationWorkflowRequestDto =
  components['schemas']['UpdateAutomationWorkflowRequestDto'];
type AddWorkflowStepRequestDto = components['schemas']['AddWorkflowStepRequestDto'];
type UpdateWorkflowStepRequestDto = components['schemas']['UpdateWorkflowStepRequestDto'];
type TestFireWorkflowRequestDto = components['schemas']['TestFireWorkflowRequestDto'];
type RetryWorkflowRunRequestDto = components['schemas']['RetryWorkflowRunRequestDto'];

export function fromWorkflowStepResponse(
  dto: AutomationWorkflowStepResponseDto,
): AutomationWorkflowStep {
  return {
    id: dto.id,
    order: dto.order,
    agentId: dto.agentId,
    inputTemplate: { ...dto.inputTemplate },
    ...(dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt } : {}),
  };
}

export function fromWorkflowResponse(dto: AutomationWorkflowResponseDto): AutomationWorkflow {
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    triggerType: dto.triggerType,
    ...(dto.eventTopic !== undefined ? { eventTopic: dto.eventTopic } : {}),
    ...(dto.scheduleCron !== undefined ? { scheduleCron: dto.scheduleCron } : {}),
    ...(dto.scheduleTimezone !== undefined ? { scheduleTimezone: dto.scheduleTimezone } : {}),
    createdAt: dto.createdAt,
    triggerFields: (dto.triggerFields ?? []).map((field) => ({
      name: field.name,
      type: field.type,
      ...(field.label !== undefined ? { label: field.label } : {}),
      ...(field.required !== undefined ? { required: field.required } : {}),
    })),
    steps: dto.steps.map(fromWorkflowStepResponse),
  };
}

export function fromWorkflowRunResponse(
  dto: AutomationWorkflowRunResponseDto,
): AutomationWorkflowRun {
  const documentDtos = (dto as AutomationWorkflowRunWithDocumentsResponseDto).documents ?? [];
  return {
    runId: dto.runId,
    status: dto.status,
    triggeredBy: dto.triggeredBy,
    startedAt: dto.startedAt,
    ...(dto.finishedAt !== undefined ? { finishedAt: dto.finishedAt } : {}),
    steps: dto.steps.map((step) => ({
      stepId: step.stepId,
      status: step.status,
      ...(step.output !== undefined ? { output: step.output } : {}),
      ...(step.agentRunId !== undefined ? { agentRunId: step.agentRunId } : {}),
      ...(step.startedAt !== undefined ? { startedAt: step.startedAt } : {}),
      ...(step.finishedAt !== undefined ? { finishedAt: step.finishedAt } : {}),
    })),
    documents: documentDtos.map(mapAutomationDocument),
  };
}

function mapAutomationDocument(dto: AutomationWorkflowDocumentResponseDto): Document {
  return {
    id: dto.id,
    filename: dto.filename,
    mimeType: dto.mime_type,
    pageCount: dto.page_count,
    extractionStatus: dto.extraction_status,
    chartPreviews: dto.chart_previews ?? [],
    createdAt: dto.created_at,
  };
}

export function fromWorkflowRunSummaryResponse(
  dto: AutomationWorkflowRunSummaryResponseDto,
): AutomationWorkflowRunSummary {
  return {
    runId: dto.runId,
    status: dto.status,
    triggeredBy: dto.triggeredBy,
    startedAt: dto.startedAt,
    ...(dto.finishedAt !== undefined ? { finishedAt: dto.finishedAt } : {}),
  };
}

export function toCreateWorkflowRequest(
  input: CreateAutomationWorkflowInput,
): CreateAutomationWorkflowRequestDto {
  return {
    name: input.name,
    triggerType: input.triggerType,
    ...(input.eventTopic !== undefined ? { eventTopic: input.eventTopic } : {}),
    ...(input.scheduleCron !== undefined ? { scheduleCron: input.scheduleCron } : {}),
    ...(input.scheduleTimezone !== undefined ? { scheduleTimezone: input.scheduleTimezone } : {}),
    ...(input.triggerFields !== undefined
      ? { triggerFields: input.triggerFields.map((field) => ({ ...field })) }
      : {}),
  };
}

export function toUpdateWorkflowRequest(
  input: UpdateAutomationWorkflowInput,
): UpdateAutomationWorkflowRequestDto {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.triggerFields !== undefined
      ? { triggerFields: input.triggerFields.map((field) => ({ ...field })) }
      : {}),
  };
}

export function toAddWorkflowStepRequest(input: AddWorkflowStepInput): AddWorkflowStepRequestDto {
  return {
    agentId: input.agentId,
    inputTemplate: { ...input.inputTemplate },
    ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
  };
}

export function toUpdateWorkflowStepRequest(
  input: UpdateWorkflowStepInput,
): UpdateWorkflowStepRequestDto {
  return {
    ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
    ...(input.inputTemplate !== undefined ? { inputTemplate: { ...input.inputTemplate } } : {}),
    ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
  };
}

export function toTestFireWorkflowRequest(
  input: TestFireWorkflowInput,
): TestFireWorkflowRequestDto {
  return {
    payload: { ...input.payload },
    ...(input.forceFailAtStep !== undefined ? { forceFailAtStep: input.forceFailAtStep } : {}),
  };
}

export function toRetryWorkflowRunRequest(resumeFromStep: number): RetryWorkflowRunRequestDto {
  return { resumeFromStep };
}

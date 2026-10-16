import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { ActionActor } from '@application/actions/action.types';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import { ACTION_AUDIT_LOG } from '@application/actions/tokens';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { runAction, unwrapCompleted } from '@presentation/http/run-action';
import { approvalOverrideFor } from '@presentation/http/action-approval-override';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  AUTOMATION_WORKFLOW_ACTIONS,
  type AutomationWorkflowActions,
} from '@application/automation-workflow/automation-workflow.actions';
import { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
// Reused as-is rather than duplicated per-domain (unlike Chart/Automation's
// own copies): neither guard's logic references AgentAutomation — both only
// resolve a generic ActionActor from the request — so a second byte-for-byte
// copy for this domain would be pure duplication, not an established
// pattern worth following here.
import { AutomationAgentAuthGuard } from '@presentation/http/automation-agent-auth.guard';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RUN_ID_HEADER } from '@presentation/http/run-id-header';
import type { AutomationMutationRequest } from '@presentation/http/automation-mutation.guard';
import {
  AddWorkflowStepRequestDto,
  AutomationWorkflowResponseDto,
  AutomationWorkflowRunResponseDto,
  AutomationWorkflowRunSummaryResponseDto,
  AutomationWorkflowStepResponseDto,
  CreateAutomationWorkflowRequestDto,
  RetryWorkflowRunRequestDto,
  TestFireWorkflowRequestDto,
  UpdateAutomationWorkflowRequestDto,
  UpdateWorkflowStepRequestDto,
} from '@presentation/automation-workflow/automation-workflow.dto';

@ApiTags('automation-workflows')
@Controller('automation-workflows')
@RequireWorkspaceFeature('AUTOMATIONS')
export class AutomationWorkflowController {
  public constructor(
    @Inject(AUTOMATION_WORKFLOW_ACTIONS) private readonly actions: AutomationWorkflowActions,
    @Inject(ACTION_AUDIT_LOG) private readonly auditLog: IActionAuditLog,
    private readonly pendingActions: PendingActionUseCases,
    private readonly useCases: AutomationWorkflowUseCases,
  ) {}

  @Post()
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @ApiOperation({ summary: 'Create a multi-step automation workflow, with no steps yet' })
  @ApiOkResponse({ type: AutomationWorkflowResponseDto })
  public async create(
    @Req() req: AutomationMutationRequest,
    @Body() body: CreateAutomationWorkflowRequestDto,
  ): Promise<AutomationWorkflowResponseDto> {
    const principal = requireAuthenticatedPrincipal(req);
    const result = await runAction(
      this.actions.create,
      {
        organizationId: principal.organizationId,
        name: body.name,
        triggerType: body.triggerType,
        eventTopic: body.eventTopic,
        scheduleCron: body.scheduleCron,
        scheduleTimezone: body.scheduleTimezone,
        triggerFields: body.triggerFields,
        createdBy: principal.identityId,
      },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.create.name),
    );
    return AutomationWorkflowResponseDto.from(unwrapCompleted(result), []);
  }

  @Get()
  @ApiOperation({ summary: 'List automation workflows for the organization' })
  @ApiOkResponse({ type: AutomationWorkflowResponseDto, isArray: true })
  public async list(
    @Req() req: AutomationMutationRequest,
  ): Promise<readonly AutomationWorkflowResponseDto[]> {
    const organizationId = requireAuthenticatedPrincipal(req).organizationId;
    const workflows = await this.useCases.listWorkflows(organizationId);
    return Promise.all(
      workflows.map(async (workflow) => {
        const steps = await this.useCases.listSteps(workflow.id);
        return AutomationWorkflowResponseDto.from(workflow, steps);
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one automation workflow with its steps' })
  @ApiOkResponse({ type: AutomationWorkflowResponseDto })
  public async get(@Param('id') id: string): Promise<AutomationWorkflowResponseDto> {
    const found = await this.useCases.getWorkflow(id);
    if (found === undefined) {
      throw new NotFoundException({
        code: 'automation_workflow_not_found',
        message: `Automation workflow ${id} not found`,
      });
    }
    return AutomationWorkflowResponseDto.from(found.workflow, found.steps);
  }

  @Patch(':id')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @ApiOperation({ summary: 'Rename and/or enable/disable an automation workflow' })
  @ApiOkResponse({ type: AutomationWorkflowResponseDto })
  public async update(
    @Req() req: AutomationMutationRequest,
    @Param('id') id: string,
    @Body() body: UpdateAutomationWorkflowRequestDto,
  ): Promise<AutomationWorkflowResponseDto> {
    if (body.enabled !== undefined) {
      await runAction(
        this.actions.setEnabled,
        { workflowId: id, enabled: body.enabled },
        actorOf(req),
        this.auditLog,
        this.pendingActions,
        undefined,
        approvalOverrideFor(req, this.actions.setEnabled.name),
      );
    }
    if (
      body.triggerType !== undefined ||
      body.eventTopic !== undefined ||
      body.scheduleCron !== undefined ||
      body.scheduleTimezone !== undefined ||
      body.triggerFields !== undefined
    ) {
      await runAction(
        this.actions.updateTrigger,
        {
          workflowId: id,
          triggerType: body.triggerType,
          eventTopic: body.eventTopic,
          scheduleCron: body.scheduleCron,
          scheduleTimezone: body.scheduleTimezone,
          triggerFields: body.triggerFields,
        },
        actorOf(req),
        this.auditLog,
        this.pendingActions,
        undefined,
        approvalOverrideFor(req, this.actions.updateTrigger.name),
      );
    }
    if (body.name !== undefined) {
      await this.useCases.renameWorkflow(id, body.name);
    }
    const found = await this.useCases.getWorkflow(id);
    if (found === undefined) {
      throw new NotFoundException({
        code: 'automation_workflow_not_found',
        message: `Automation workflow ${id} not found`,
      });
    }
    return AutomationWorkflowResponseDto.from(found.workflow, found.steps);
  }

  @Delete(':id')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an automation workflow (not chat-callable — UI-only operation)',
  })
  @ApiNoContentResponse()
  public async remove(@Param('id') id: string): Promise<void> {
    await this.useCases.deleteWorkflow(id);
  }

  @Post(':id/duplicate')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @ApiOperation({ summary: 'Duplicate a workflow into a new draft copy with no run history' })
  @ApiOkResponse({ type: AutomationWorkflowResponseDto })
  public async duplicate(
    @Req() req: AutomationMutationRequest,
    @Param('id') id: string,
  ): Promise<AutomationWorkflowResponseDto> {
    const principal = requireAuthenticatedPrincipal(req);
    const copy = await this.useCases.duplicateWorkflow(
      id,
      principal.identityId,
    );
    const steps = await this.useCases.listSteps(copy.id);
    return AutomationWorkflowResponseDto.from(copy, steps);
  }

  @Post(':id/steps')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @ApiOperation({ summary: 'Append a step to a workflow’s chain' })
  @ApiOkResponse({ type: AutomationWorkflowStepResponseDto })
  public async addStep(
    @Req() req: AutomationMutationRequest,
    @Param('id') id: string,
    @Body() body: AddWorkflowStepRequestDto,
  ): Promise<AutomationWorkflowStepResponseDto> {
    const result = await runAction(
      this.actions.addStep,
      {
        workflowId: id,
        agentId: body.agentId,
        inputTemplate: body.inputTemplate,
        systemPrompt: body.systemPrompt,
      },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.addStep.name),
    );
    return AutomationWorkflowStepResponseDto.from(unwrapCompleted(result));
  }

  @Patch(':id/steps/:stepId')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @ApiOperation({ summary: 'Edit an existing step’s agent and/or input mapping' })
  @ApiOkResponse({ type: AutomationWorkflowStepResponseDto })
  public async updateStep(
    @Req() req: AutomationMutationRequest,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() body: UpdateWorkflowStepRequestDto,
  ): Promise<AutomationWorkflowStepResponseDto> {
    const result = await runAction(
      this.actions.updateStep,
      {
        workflowId: id,
        stepId,
        agentId: body.agentId,
        inputTemplate: body.inputTemplate,
        systemPrompt: body.systemPrompt,
      },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.updateStep.name),
    );
    return AutomationWorkflowStepResponseDto.from(unwrapCompleted(result));
  }

  @Delete(':id/steps/:stepId')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @ApiOperation({
    summary: 'Propose removing a step from a workflow (requires approval by default)',
  })
  public async removeStep(
    @Req() req: AutomationMutationRequest,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
  ): Promise<{ status: 'pending_approval'; pending_action_id: string } | undefined> {
    const result = await runAction(
      this.actions.removeStep,
      { workflowId: id, stepId },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.removeStep.name),
    );
    if (result.kind === 'pending_approval') {
      return { status: 'pending_approval', pending_action_id: result.pendingActionId };
    }
    return undefined;
  }

  @Post(':id/test-fire')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @ApiOperation({ summary: 'Run a workflow’s full chain with a sample payload, for real' })
  public async testFire(
    @Req() req: AutomationMutationRequest,
    @Param('id') id: string,
    @Body() body: TestFireWorkflowRequestDto,
  ): Promise<{ runId: string }> {
    const result = await runAction(
      this.actions.testFire,
      { workflowId: id, payload: body.payload, forceFailAtStep: body.forceFailAtStep },
      actorOf(req),
      this.auditLog,
      this.pendingActions,
      undefined,
      approvalOverrideFor(req, this.actions.testFire.name),
    );
    const run = unwrapCompleted(result) as { id: string };
    return { runId: run.id };
  }

  @Get(':id/runs')
  @ApiOperation({
    summary:
      'List the workflow’s runs, newest first, however each was started (dialog, chat, or a schedule firing)',
  })
  @ApiOkResponse({ type: AutomationWorkflowRunSummaryResponseDto, isArray: true })
  public async listRuns(
    @Param('id') id: string,
  ): Promise<AutomationWorkflowRunSummaryResponseDto[]> {
    const runs = await this.useCases.listRuns(id);
    return AutomationWorkflowRunSummaryResponseDto.fromList(runs);
  }

  @Get(':id/runs/:runId')
  @ApiOperation({ summary: 'Poll a workflow run’s status and per-step output' })
  @ApiOkResponse({ type: AutomationWorkflowRunResponseDto })
  public async runStatus(@Param('runId') runId: string): Promise<AutomationWorkflowRunResponseDto> {
    const found = await this.useCases.getRunStatus(runId);
    if (found === undefined) {
      throw new NotFoundException({
        code: 'automation_workflow_run_not_found',
        message: `Automation workflow run ${runId} not found`,
      });
    }
    return AutomationWorkflowRunResponseDto.from(found.run, found.stepRuns, found.documents ?? []);
  }

  @Post(':id/runs/:runId/retry')
  @UseGuards(AutomationAgentAuthGuard)
  @MachineAuthenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retry a failed workflow run starting from the given step' })
  @ApiNoContentResponse()
  public async retry(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Body() body: RetryWorkflowRunRequestDto,
  ): Promise<void> {
    await this.useCases.retryWorkflowRun(runId, id, body.resumeFromStep);
  }
}

function actorOf(req: AutomationMutationRequest): ActionActor {
  return (
    req.automationActor ?? {
      source: 'anonymous',
      runId: req.get(RUN_ID_HEADER) ?? null,
      identityId: null,
    }
  );
}

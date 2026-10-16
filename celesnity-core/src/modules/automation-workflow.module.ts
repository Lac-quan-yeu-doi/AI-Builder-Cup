import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';

import {
  AGENT_RUN_FILES_CLIENT,
  AGENT_RUN_STATUS_CLIENT,
  AGENT_WORKSPACE_TREE_CLIENT,
  AGENT_TRANSCRIPT_CLIENT,
  ROOM_OWNERSHIP_RESOLVER,
  RUN_OWNERSHIP_RESOLVER,
  AUTOMATION_WORKFLOW_REPOSITORY,
  AUTOMATION_WORKFLOW_RUN_REPOSITORY,
} from '@application/automation-workflow/tokens';
import { AGENT_WEBHOOK_CLIENT } from '@application/automation/tokens';
import { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
import {
  AutomationWorkflowDispatcher,
  type IAutomationWorkflowStepPoller,
} from '@application/automation-workflow/automation-workflow-dispatcher';
import {
  AUTOMATION_WORKFLOW_ACTIONS,
  buildAutomationWorkflowActions,
  type AutomationWorkflowActions,
} from '@application/automation-workflow/automation-workflow.actions';
import type { ActionPolicyOverrides } from '@application/actions/action-policy';
import { ACTION_POLICY_OVERRIDES } from '@application/actions/tokens';
import type { IAutomationWorkflowRepository } from '@application/automation-workflow/interfaces/i-automation-workflow.repository';
import type { IAutomationWorkflowRunRepository } from '@application/automation-workflow/interfaces/i-automation-workflow-run.repository';
import type { IAgentWebhookClient } from '@application/automation/interfaces/i-agent-webhook-client';
import type { IAgentRunStatusClient } from '@application/automation-workflow/interfaces/i-agent-run-status-client';
import { PrismaAutomationWorkflowRepository } from '@infrastructure/prisma/automation-workflow/prisma-automation-workflow.repository';
import { PrismaAutomationWorkflowRunRepository } from '@infrastructure/prisma/automation-workflow/prisma-automation-workflow-run.repository';
import { AgentRunFilesClient } from '@infrastructure/http/automation-workflow/agent-run-files.client';
import { AgentRunStatusClient } from '@infrastructure/http/automation-workflow/agent-run-status.client';
import { AgentWorkspaceTreeClient } from '@infrastructure/http/automation-workflow/agent-workspace-tree.client';
import { AgentTranscriptHttpClient } from '@infrastructure/http/automation-workflow/agent-transcript.client';
import { AgentWebhookClient } from '@infrastructure/http/automation/agent-webhook.client';
import { CronAgentAutomationSchedule } from '@infrastructure/scheduling/cron-agent-automation-schedule';
import {
  AutomationWorkflowStepPoller,
  type AgentTranscriptClient,
} from '@infrastructure/worker/automation-workflow/automation-workflow-step-poller';
import { RunOwnershipResolver } from '@infrastructure/automation-workflow/run-ownership-resolver';
import { RoomOwnershipResolver } from '@infrastructure/automation-workflow/room-ownership-resolver';
import { AutomationWorkflowController } from '@presentation/automation-workflow/automation-workflow.controller';
import { AutomationWorkflowActionsCatalogController } from '@presentation/actions/automation-workflow-actions-catalog.controller';
import { AutomationWorkflowMcpController } from '@presentation/automation-workflow/automation-workflow-mcp.controller';
import { RunFilesController } from '@presentation/automation-workflow/run-files.controller';
import { WorkspaceTreeController } from '@presentation/automation-workflow/workspace-tree.controller';
import { AutomationAgentAuthGuard } from '@presentation/http/automation-agent-auth.guard';
import { AutomationMutationGuard } from '@presentation/http/automation-mutation.guard';
import { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import { ActionsModule } from './actions.module';
import { SecurityModule } from './security.module';
import { AdministrationModule } from './administration.module';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * New domain module, alongside AutomationModule (not a replacement) — see
 * the design spec's "No migration" non-goal. Registers its own
 * `AgentWebhookClient` instance rather than importing AutomationModule for
 * it — that class is stateless (reads MINDER_AGENT_URL from config) and
 * AutomationModule doesn't export its token, so a second DI-registered
 * instance here is simpler than widening AutomationModule's exports for a
 * class this module doesn't otherwise touch.
 */
@Module({
  imports: [SecurityModule, AdministrationModule, forwardRef(() => ActionsModule)],
  controllers: [
    AutomationWorkflowController,
    AutomationWorkflowActionsCatalogController,
    AutomationWorkflowMcpController,
    RunFilesController,
    WorkspaceTreeController,
  ],
  providers: [
    PrismaAutomationWorkflowRepository,
    PrismaAutomationWorkflowRunRepository,
    AgentRunStatusClient,
    AgentTranscriptHttpClient,
    AgentRunFilesClient,
    AgentWorkspaceTreeClient,
    RunOwnershipResolver,
    RoomOwnershipResolver,
    { provide: RUN_OWNERSHIP_RESOLVER, useExisting: RunOwnershipResolver },
    { provide: ROOM_OWNERSHIP_RESOLVER, useExisting: RoomOwnershipResolver },
    AgentWebhookClient,
    AutomationMutationGuard,
    AutomationAgentAuthGuard,
    AgentWorkloadIdentityVerifier,
    { provide: AUTOMATION_WORKFLOW_REPOSITORY, useExisting: PrismaAutomationWorkflowRepository },
    {
      provide: AUTOMATION_WORKFLOW_RUN_REPOSITORY,
      useExisting: PrismaAutomationWorkflowRunRepository,
    },
    { provide: AGENT_RUN_STATUS_CLIENT, useExisting: AgentRunStatusClient },
    { provide: AGENT_TRANSCRIPT_CLIENT, useExisting: AgentTranscriptHttpClient },
    { provide: AGENT_RUN_FILES_CLIENT, useExisting: AgentRunFilesClient },
    { provide: AGENT_WORKSPACE_TREE_CLIENT, useExisting: AgentWorkspaceTreeClient },
    { provide: AGENT_WEBHOOK_CLIENT, useExisting: AgentWebhookClient },
    {
      provide: AutomationWorkflowStepPoller,
      inject: [AGENT_RUN_STATUS_CLIENT, AGENT_TRANSCRIPT_CLIENT],
      useFactory: (
        statusClient: IAgentRunStatusClient,
        transcriptClient: AgentTranscriptClient,
      ): AutomationWorkflowStepPoller =>
        new AutomationWorkflowStepPoller(statusClient, transcriptClient, {
          pollIntervalMs: POLL_INTERVAL_MS,
          timeoutMs: POLL_TIMEOUT_MS,
        }),
    },
    {
      provide: AutomationWorkflowDispatcher,
      inject: [
        AUTOMATION_WORKFLOW_REPOSITORY,
        AUTOMATION_WORKFLOW_RUN_REPOSITORY,
        AGENT_WEBHOOK_CLIENT,
        AutomationWorkflowStepPoller,
        AuthenticatedContextStore,
      ],
      useFactory: (
        workflows: IAutomationWorkflowRepository,
        runs: IAutomationWorkflowRunRepository,
        webhookClient: IAgentWebhookClient,
        poller: IAutomationWorkflowStepPoller,
        contexts: AuthenticatedContextStore,
      ): AutomationWorkflowDispatcher =>
        new AutomationWorkflowDispatcher(workflows, runs, webhookClient, poller, contexts),
    },
    {
      provide: AutomationWorkflowUseCases,
      inject: [
        AUTOMATION_WORKFLOW_REPOSITORY,
        AUTOMATION_WORKFLOW_RUN_REPOSITORY,
        AutomationWorkflowDispatcher,
        AGENT_WEBHOOK_CLIENT,
      ],
      useFactory: (
        workflows: IAutomationWorkflowRepository,
        runs: IAutomationWorkflowRunRepository,
        dispatcher: AutomationWorkflowDispatcher,
        webhookClient: IAgentWebhookClient,
      ): AutomationWorkflowUseCases =>
        new AutomationWorkflowUseCases(
          workflows,
          runs,
          dispatcher,
          webhookClient,
          new CronAgentAutomationSchedule(),
        ),
    },
    {
      provide: AUTOMATION_WORKFLOW_ACTIONS,
      inject: [AutomationWorkflowUseCases, ACTION_POLICY_OVERRIDES],
      useFactory: (
        useCases: AutomationWorkflowUseCases,
        policy: ActionPolicyOverrides,
      ): AutomationWorkflowActions => buildAutomationWorkflowActions(useCases, policy),
    },
    {
      provide: 'AUTOMATION_DEFAULT_ORGANIZATION_ID',
      inject: [ConfigService],
      useFactory: (config: ConfigService): string =>
        config.getOrThrow<string>('DEFAULT_ORGANIZATION_ID'),
    },
  ],
  exports: [AutomationWorkflowUseCases, AUTOMATION_WORKFLOW_ACTIONS],
})
export class AutomationWorkflowModule {}

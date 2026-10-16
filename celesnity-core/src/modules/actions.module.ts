import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR } from '@application/shared/tokens';
import type { IActionResolver } from '@application/actions/interfaces/i-action-resolver';
import type { IAuditLogRepository } from '@application/actions/interfaces/i-audit-log.repository';
import type { IPendingActionRepository } from '@application/actions/interfaces/i-pending-action.repository';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { CompositeActionResolver } from '@application/actions/composite-action-resolver';
import {
  loadActionPolicyOverrides,
  type ActionPolicyOverrides,
} from '@application/actions/action-policy';
import {
  ACTION_AUDIT_LOG,
  ACTION_POLICY_OVERRIDES,
  ACTION_RESOLVER,
  AUDIT_LOG_REPOSITORY,
  PENDING_ACTION_REPOSITORY,
} from '@application/actions/tokens';
import { CHART_ACTIONS, type ChartActions } from '@application/chart/chart.actions';
import { ChartActionResolver } from '@application/chart/chart-action-resolver';
import {
  AUTOMATION_WORKFLOW_ACTIONS,
  type AutomationWorkflowActions,
} from '@application/automation-workflow/automation-workflow.actions';
import { AutomationWorkflowActionResolver } from '@application/automation-workflow/automation-workflow-action-resolver';
import { PrismaActionAuditLog } from '@infrastructure/actions/prisma-action-audit-log';
import { PrismaAuditLogRepository } from '@infrastructure/prisma/actions/prisma-audit-log.repository';
import { PrismaPendingActionRepository } from '@infrastructure/prisma/actions/prisma-pending-action.repository';
import { SystemClock } from '@infrastructure/system/system-clock';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { AuditLogController } from '@presentation/actions/audit-log.controller';
import { PendingActionController } from '@presentation/actions/pending-action.controller';
import { ChartModule } from './chart.module';
import { AutomationWorkflowModule } from './automation-workflow.module';

/**
 * The AIP action registry's domain-agnostic half: audit log, Checkpoint
 * (pending-action) use cases, and the composite resolver every registered
 * domain's actions are merged into. Extracted out of `ChartModule`, which
 * used to own this alone even though none of it is chart-specific — see
 * `docs/superpowers/specs/2026-09-01-agent-automation-aip-actions-design.md`.
 *
 * `forwardRef(() => ChartModule)` because `ChartModule` also needs this
 * module's `PendingActionUseCases`/`ACTION_AUDIT_LOG` — a genuine circular
 * module import, not a mistake. `AutomationModule` and `AutomationWorkflowModule`
 * join the same way.
 */
@Module({
  imports: [forwardRef(() => ChartModule), forwardRef(() => AutomationWorkflowModule)],
  controllers: [PendingActionController, AuditLogController],
  providers: [
    PrismaPendingActionRepository,
    PrismaAuditLogRepository,
    SystemClock,
    RandomUuidGenerator,
    { provide: PENDING_ACTION_REPOSITORY, useExisting: PrismaPendingActionRepository },
    { provide: AUDIT_LOG_REPOSITORY, useExisting: PrismaAuditLogRepository },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: ACTION_POLICY_OVERRIDES,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ActionPolicyOverrides =>
        loadActionPolicyOverrides(config.getOrThrow<string>('AGENT_ACTIONS_POLICY_PATH')),
    },
    {
      provide: ACTION_AUDIT_LOG,
      inject: [AUDIT_LOG_REPOSITORY, CLOCK, ID_GENERATOR],
      useFactory: (
        repository: IAuditLogRepository,
        clock: IClock,
        ids: IIdGenerator,
      ): PrismaActionAuditLog => new PrismaActionAuditLog(repository, clock, ids),
    },
    {
      provide: ACTION_RESOLVER,
      inject: [CHART_ACTIONS, AUTOMATION_WORKFLOW_ACTIONS],
      useFactory: (
        chartActions: ChartActions,
        automationWorkflowActions: AutomationWorkflowActions,
      ): IActionResolver =>
        new CompositeActionResolver([
          new ChartActionResolver(chartActions),
          new AutomationWorkflowActionResolver(automationWorkflowActions),
        ]),
    },
    {
      provide: PendingActionUseCases,
      inject: [PENDING_ACTION_REPOSITORY, ACTION_RESOLVER, CLOCK, ID_GENERATOR, ConfigService],
      useFactory: (
        repository: IPendingActionRepository,
        resolver: IActionResolver,
        clock: IClock,
        ids: IIdGenerator,
        config: ConfigService,
      ): PendingActionUseCases =>
        new PendingActionUseCases(
          repository,
          resolver,
          clock,
          ids,
          config.getOrThrow<number>('PENDING_ACTION_TTL_MS'),
        ),
    },
  ],
  exports: [
    PendingActionUseCases,
    ACTION_AUDIT_LOG,
    ACTION_RESOLVER,
    ACTION_POLICY_OVERRIDES,
    CLOCK,
    ID_GENERATOR,
  ],
})
export class ActionsModule {}

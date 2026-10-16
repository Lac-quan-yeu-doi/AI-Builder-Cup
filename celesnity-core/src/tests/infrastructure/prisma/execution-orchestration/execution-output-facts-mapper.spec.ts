import type { ConfigService } from '@nestjs/config';

import { Prisma } from '@generated/prisma/client';
import type { ExecutionModel } from '@generated/prisma/models/Execution';
import { ExecutionResponseDto } from '@presentation/execution-orchestration/execution.response';
import { toExecutionView } from '@application/execution-orchestration/read-models/execution.projection';
import { ExecutionMapper } from '@infrastructure/prisma/execution-orchestration/execution.mapper';
import { ExecutionStatusValue } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import type {
  ExecutionOutputConditionPlan,
  ExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';

const EXECUTION_ID = '46e0a6fd-3e0f-41b2-8f69-490db51d5eb6';
const PIPELINE_ID = '730a46fd-3e0f-41b2-8f69-490db51d5eb6';
const PIPELINE_VERSION_ID = '830a46fd-3e0f-41b2-8f69-490db51d5eb6';
const QUEUED_AT = new Date('2026-09-24T10:00:00.000Z');
const PLAN: ExecutionOutputConditionPlan = {
  targets: [
    {
      targetNodeId: 'target-orders',
      predicates: [{ branchId: 'high-value', column: 'amount', operator: 'GT', value: 10_000 }],
    },
  ],
};
const FACTS: ExecutionOutputFacts = {
  executionId: EXECUTION_ID,
  targets: [
    {
      targetNodeId: 'target-orders',
      totalRows: 3,
      matchesByBranchId: { 'high-value': 1 },
    },
  ],
};

describe('ExecutionMapper output facts', () => {
  it('rehydrates and persists scalar run-data facts with their execution plan', () => {
    const mapper = new ExecutionMapper({
      getOrThrow: jest.fn().mockReturnValue('celesnity-artifacts'),
    } as unknown as ConfigService);
    const record = {
      id: EXECUTION_ID,
      organizationId: '00000000-0000-4000-8000-000000000001',
      workloadKind: 'PIPELINE',
      workloadVersionNumber: 1,
      scriptId: null,
      scriptVersionId: null,
      pipelineId: PIPELINE_ID,
      pipelineVersionId: PIPELINE_VERSION_ID,
      databaseServiceId: null,
      authorizationIdentityId: null,
      status: ExecutionStatusValue.SUCCEEDED,
      sparkApplicationId: null,
      resourceProfile: {
        driverMemory: '1g',
        executorMemory: '1g',
        executorCores: 1,
        maxCores: 2,
      },
      exitCode: 0,
      errorSummary: null,
      outputConditionPlan: PLAN,
      outputFacts: FACTS,
      outputFactsError: null,
      logObjectKey: `executions/${EXECUTION_ID}.log`,
      queuedAt: QUEUED_AT,
      startedAt: QUEUED_AT,
      finishedAt: QUEUED_AT,
      cancelledAt: null,
      updatedAt: QUEUED_AT,
    } as unknown as ExecutionModel;

    expect(ExecutionResponseDto.from(mapper.toView(record)).executionPrincipal).toBe('BACKGROUND');
    const requested = { ...record, authorizationIdentityId: 'requesting-user' };
    expect(ExecutionResponseDto.from(mapper.toView(requested)).executionPrincipal).toBe(
      'REQUESTER',
    );
    expect(toExecutionView(mapper.toDomain(requested), 'artifacts').executionPrincipal).toBe(
      'REQUESTER',
    );
    const execution = mapper.toDomain(record);
    const persisted = mapper.toPersistence(execution);

    expect(execution.outputFacts).toEqual(FACTS);
    expect(persisted.outputConditionPlan).toEqual(PLAN);
    expect(persisted.outputFacts).toEqual(FACTS);
    expect(persisted.outputFactsError).toBeNull();
  });

  it('writes SQL NULL for absent plan and result-fact columns', () => {
    const mapper = new ExecutionMapper({
      getOrThrow: jest.fn().mockReturnValue('celesnity-artifacts'),
    } as unknown as ConfigService);
    const record = {
      id: EXECUTION_ID,
      organizationId: '00000000-0000-4000-8000-000000000001',
      workloadKind: 'PIPELINE',
      workloadVersionNumber: 1,
      scriptId: null,
      scriptVersionId: null,
      pipelineId: PIPELINE_ID,
      pipelineVersionId: PIPELINE_VERSION_ID,
      databaseServiceId: null,
      authorizationIdentityId: null,
      status: ExecutionStatusValue.QUEUED,
      sparkApplicationId: null,
      resourceProfile: {
        driverMemory: '1g',
        executorMemory: '1g',
        executorCores: 1,
        maxCores: 2,
      },
      exitCode: null,
      errorSummary: null,
      outputConditionPlan: null,
      outputFacts: null,
      outputFactsError: null,
      logObjectKey: `executions/${EXECUTION_ID}.log`,
      queuedAt: QUEUED_AT,
      startedAt: null,
      finishedAt: null,
      cancelledAt: null,
      updatedAt: QUEUED_AT,
    } as unknown as ExecutionModel;

    const persisted = mapper.toPersistence(mapper.toDomain(record));

    expect(persisted.outputConditionPlan).toBe(Prisma.DbNull);
    expect(persisted.outputFacts).toBe(Prisma.DbNull);
  });
});

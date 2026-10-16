import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';

import type {
  IWorkflowNodeAttemptExecutionRepository,
  WorkflowNodeAttemptExecution,
  WorkflowNodeAttemptIdentity,
} from '@application/data-workflow/interfaces/i-workflow-node-attempt-execution-repository';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaWorkflowNodeAttemptExecutionRepository implements IWorkflowNodeAttemptExecutionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async lock(
    identity: WorkflowNodeAttemptIdentity,
  ): Promise<WorkflowNodeAttemptExecution | undefined> {
    const attempt = await this.prisma.client.dataWorkflowNodeAttempt.findFirst({
      where: {
        organizationId: identity.organizationId,
        runId: identity.runId,
        nodeId: identity.nodeId,
        attemptNumber: identity.attemptNumber,
      },
      select: { id: true },
    });
    if (attempt === null) return undefined;

    const locked = await this.prisma.client.$queryRaw<
      readonly { readonly execution_id: string | null }[]
    >(Prisma.sql`
      SELECT attempt.execution_id
      FROM "celesnity_app"."data_workflow_node_attempts" AS attempt
      INNER JOIN "celesnity_app"."data_workflow_runs" AS run
        ON run.id = attempt.run_id
       AND run.organization_id = attempt.organization_id
      WHERE attempt.id = ${attempt.id}::uuid
        AND run.id = ${identity.runId}::uuid
        AND run.organization_id = ${identity.organizationId}::uuid
        AND run.status = 'RUNNING'
        AND run.lease_owner = ${identity.leaseOwner}
        AND run.lease_token = ${identity.leaseToken}::uuid
        AND run.lease_expires_at > CURRENT_TIMESTAMP
      FOR UPDATE OF attempt, run
    `);
    const row = locked[0];
    if (row === undefined) return undefined;
    return row.execution_id === null ? {} : { executionId: row.execution_id };
  }

  public async associate(
    identity: WorkflowNodeAttemptIdentity,
    executionId: string,
  ): Promise<boolean> {
    const result = await this.prisma.client.$executeRaw(Prisma.sql`
      UPDATE "celesnity_app"."data_workflow_node_attempts" AS attempt
      SET execution_id = ${executionId}::uuid
      FROM "celesnity_app"."data_workflow_runs" AS run
      WHERE attempt.organization_id = ${identity.organizationId}::uuid
        AND attempt.run_id = ${identity.runId}::uuid
        AND attempt.node_id = ${identity.nodeId}
        AND attempt.attempt_number = ${identity.attemptNumber}
        AND attempt.execution_id IS NULL
        AND run.id = attempt.run_id
        AND run.organization_id = attempt.organization_id
        AND run.status = 'RUNNING'
        AND run.lease_owner = ${identity.leaseOwner}
        AND run.lease_token = ${identity.leaseToken}::uuid
        AND run.lease_expires_at > CURRENT_TIMESTAMP
    `);
    return result === 1;
  }
}

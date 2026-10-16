import { ForbiddenException, Injectable } from '@nestjs/common';

import type {
  IWorkflowAccess,
  PipelineReference,
  WorkflowActor,
  WorkflowOperation,
} from '@application/data-workflow/interfaces/i-workflow-access';
import { roleAllows, type Permission } from '@application/administration/authorization-policy';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Enforces the same active-membership workspace policy as HTTP authorization,
 * then applies tenant ownership to workflow and pinned pipeline records.
 */
@Injectable()
export class WorkflowAccessAdapter implements IWorkflowAccess {
  public constructor(private readonly prisma: PrismaService) {}

  public async require(
    actor: WorkflowActor,
    operation: WorkflowOperation,
    workflowId?: string,
  ): Promise<void> {
    await this.requireWorkspacePermission(actor, permissionFor(operation));
    if (workflowId === undefined) return;
    const workflow = await this.prisma.client.dataWorkflow.findFirst({
      where: { id: workflowId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (workflow === null) throw denied();
  }

  public async requirePipeline(actor: WorkflowActor, pipeline: PipelineReference): Promise<void> {
    await this.requireWorkspacePermission(actor, 'workspace:write');
    const version = await this.prisma.client.pipelineVersion.findFirst({
      where: {
        organizationId: actor.organizationId,
        pipelineId: pipeline.pipelineId,
        versionNumber: pipeline.versionNumber,
        pipeline: { organizationId: actor.organizationId, archivedAt: null },
      },
      select: { id: true },
    });
    if (version === null) throw denied();
  }

  private async requireWorkspacePermission(
    actor: WorkflowActor,
    permission: Permission,
  ): Promise<void> {
    const membership = await this.prisma.client.organizationMembership.findFirst({
      where: {
        organizationId: actor.organizationId,
        identityId: actor.identityId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { role: true },
    });
    if (membership === null || !roleAllows(membership.role, permission)) throw denied();
  }
}

function permissionFor(operation: WorkflowOperation): Permission {
  return operation === 'READ' ? 'workspace:read' : 'workspace:write';
}

function denied(): ForbiddenException {
  return new ForbiddenException({
    code: 'WORKFLOW_ACCESS_DENIED',
    message: 'You do not have access to this data workflow resource.',
    details: null,
  });
}

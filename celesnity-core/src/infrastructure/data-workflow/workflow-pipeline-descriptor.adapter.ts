import { Inject, Injectable } from '@nestjs/common';

import type {
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowPipelineDescriptor } from '@application/data-workflow/interfaces/i-workflow-pipeline-descriptor';
import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import { WORKFLOW_ACCESS } from '@application/data-workflow/tokens';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class WorkflowPipelineDescriptorAdapter implements IWorkflowPipelineDescriptor {
  public constructor(
    @Inject(WORKFLOW_ACCESS) private readonly access: IWorkflowAccess,
    private readonly prisma: PrismaService,
  ) {}

  public async describe(
    actor: WorkflowActor,
    reference: PipelineReference,
  ): Promise<{ readonly name: string }> {
    await this.access.requirePipeline(actor, reference);
    const pipeline = await this.prisma.client.pipeline.findFirst({
      where: {
        id: reference.pipelineId,
        organizationId: actor.organizationId,
        archivedAt: null,
        versions: { some: { versionNumber: reference.versionNumber } },
      },
      select: { name: true },
    });
    if (pipeline === null) throw new Error('Pinned pipeline is unavailable.');
    return { name: pipeline.name };
  }
}

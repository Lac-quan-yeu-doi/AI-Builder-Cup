import { Injectable } from '@nestjs/common';

import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Answers "does this organization own this agent run?" — the authorization
 * primitive for the run-files endpoints. A run is owned if it produced a
 * message block in the org (chat/interactive runs) or is the agent run of an
 * automation workflow step whose workflow belongs to the org.
 */
@Injectable()
export class RunOwnershipResolver {
  public constructor(private readonly prisma: PrismaService) {}

  public async ownsRun(runId: string, organizationId: string): Promise<boolean> {
    const messageBlock = await this.prisma.client.messageBlock.findFirst({
      where: { runId, organizationId },
      select: { id: true },
    });
    if (messageBlock !== null) {
      return true;
    }

    const stepRun = await this.prisma.client.automationWorkflowStepRun.findFirst({
      where: { agentRunId: runId, run: { workflow: { organizationId } } },
      select: { id: true },
    });
    return stepRun !== null;
  }
}

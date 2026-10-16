import { Test } from '@nestjs/testing';

import { UNIT_OF_WORK } from '@application/shared/tokens';
import { PrismaWorkflowRunClaimStore } from '@infrastructure/prisma/data-workflow/prisma-workflow-run-claim.store';
import { PrismaWorkflowScheduleClaimStore } from '@infrastructure/prisma/data-workflow/prisma-workflow-schedule-claim.store';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('workflow claim store dependency injection', () => {
  it('resolves both stores using the UnitOfWork application token', async () => {
    const prisma = {};
    const unitOfWork = {};
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaWorkflowRunClaimStore,
        PrismaWorkflowScheduleClaimStore,
        { provide: PrismaService, useValue: prisma },
        { provide: UNIT_OF_WORK, useValue: unitOfWork },
      ],
    }).compile();

    expect(moduleRef.get(PrismaWorkflowRunClaimStore)).toBeInstanceOf(PrismaWorkflowRunClaimStore);
    expect(moduleRef.get(PrismaWorkflowScheduleClaimStore)).toBeInstanceOf(
      PrismaWorkflowScheduleClaimStore,
    );

    await moduleRef.close();
  });
});

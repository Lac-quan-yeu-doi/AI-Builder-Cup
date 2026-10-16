import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { PrismaWatchSourceRepository } from '@infrastructure/prisma/data-workflow-watch-source/prisma-watch-source.repository';
import { isOrganizationScopedModel } from '@infrastructure/prisma/prisma.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-4333-8333-333333333333';
const WORKFLOW_ID = '44444444-4444-4444-8444-444444444444';
const VERSION_ID = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-09-18T09:00:00.000Z');

function unitOfWork(): IUnitOfWork {
  return { commit: async (work) => work({ record: jest.fn() }) };
}

describe('Watch Source Prisma persistence contracts', () => {
  it('registers every durable watch record for organization scoping', () => {
    for (const model of [
      'DataWorkflowWatchSource',
      'DataWorkflowWatchSourceSubscription',
      'DataWorkflowWatchSourceCheckpoint',
      'DataWorkflowWatchSourceNotificationBatch',
      'DataWorkflowWatchSourceNotification',
      'DataWorkflowWatchSourceDeliveryAssignment',
    ]) {
      expect(isOrganizationScopedModel(model)).toBe(true);
    }
  });

  it('pins a subscription to a published version without leaking use-case clock input to Prisma', async () => {
    const create = jest.fn().mockImplementation(async ({ data }) => data);
    const repository = new PrismaWatchSourceRepository(
      { client: { dataWorkflowWatchSourceSubscription: { create } } } as never,
      unitOfWork(),
    );

    await repository.createSubscription({
      id: SUBSCRIPTION_ID,
      organizationId: ORGANIZATION_ID,
      watchSourceId: SOURCE_ID,
      workflowId: WORKFLOW_ID,
      workflowVersionId: VERSION_ID,
      actor: 'publisher',
      now,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: SUBSCRIPTION_ID,
          workflowId: WORKFLOW_ID,
          workflowVersionId: VERSION_ID,
          createdAt: now,
        }),
      }),
    );
    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty('now');
  });

  it('never acknowledges a failed delivery', async () => {
    const updateMany = jest.fn();
    const repository = new PrismaWatchSourceRepository(
      { client: { dataWorkflowWatchSourceDeliveryAssignment: { updateMany } } } as never,
      unitOfWork(),
    );

    await expect(repository.completeDelivery(SUBSCRIPTION_ID, false, now)).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

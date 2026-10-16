import { WorkflowAccessAdapter } from '@infrastructure/data-workflow/workflow-access.adapter';

const actor = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
};

describe('WorkflowAccessAdapter', () => {
  it('requires the organization to remain active when reauthorizing a background run', async () => {
    const findFirst = jest.fn().mockResolvedValue({ role: 'DATA_ENGINEER' });
    const access = new WorkflowAccessAdapter({
      client: { organizationMembership: { findFirst } },
    } as never);

    await access.require(actor, 'RUN');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: actor.organizationId,
          organization: { status: 'ACTIVE' },
        }),
      }),
    );
  });
});

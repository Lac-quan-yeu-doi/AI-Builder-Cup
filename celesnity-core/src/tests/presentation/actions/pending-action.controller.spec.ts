import type { Request } from 'express';

import { PendingActionController } from '@presentation/actions/pending-action.controller';
import type { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import type { PendingActionListFilter } from '@application/actions/interfaces/i-pending-action.repository';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';

const viewer = {
  identityId: 'identity-viewer',
  subject: 'subject-viewer',
  identityTenantId: 'tenant-1',
  organizationId: 'org-1',
  organizationStatus: 'ACTIVE' as const,
  membershipId: 'membership-viewer',
  role: 'VIEWER' as const,
  authenticationTime: 1,
  mfaVerified: true,
  mfaRequired: true,
};

const orgAdmin = { ...viewer, identityId: 'identity-admin', role: 'ORG_ADMIN' as const };

function buildController(): {
  controller: PendingActionController;
  calls: (PendingActionListFilter | undefined)[];
} {
  const calls: (PendingActionListFilter | undefined)[] = [];
  const useCases = {
    list: jest.fn(async (filter?: PendingActionListFilter) => {
      calls.push(filter);
      return [];
    }),
  } as unknown as PendingActionUseCases;
  return { controller: new PendingActionController(useCases), calls };
}

function requestWithoutPrincipal(): Request {
  return {} as Request;
}

describe('PendingActionController.list owner scoping', () => {
  it('with no authenticated principal, identity_id stays a plain opt-in filter', async () => {
    const { controller, calls } = buildController();

    await controller.list(
      requestWithoutPrincipal(),
      undefined,
      undefined,
      undefined,
      'someone-elses-id',
    );

    expect(calls[0]?.identityId).toBe('someone-elses-id');
  });

  it('scopes a non-privileged human to their own proposals even if they ask for nothing', async () => {
    const { controller, calls } = buildController();
    const req = {} as Request;
    setAuthenticatedPrincipal(req, viewer);

    await controller.list(req);

    expect(calls[0]?.identityId).toBe(viewer.identityId);
  });

  it("rejects a non-privileged human explicitly requesting someone else's identity_id", async () => {
    const { controller } = buildController();
    const req = {} as Request;
    setAuthenticatedPrincipal(req, viewer);

    await expect(
      controller.list(req, undefined, undefined, undefined, 'identity-someone-else'),
    ).rejects.toThrow('You may only list your own pending actions.');
  });

  it('allows a non-privileged human to restate their own identity_id', async () => {
    const { controller, calls } = buildController();
    const req = {} as Request;
    setAuthenticatedPrincipal(req, viewer);

    await controller.list(req, undefined, undefined, undefined, viewer.identityId);

    expect(calls[0]?.identityId).toBe(viewer.identityId);
  });

  it('lets a privileged role see everything by default', async () => {
    const { controller, calls } = buildController();
    const req = {} as Request;
    setAuthenticatedPrincipal(req, orgAdmin);

    await controller.list(req);

    expect(calls[0]?.identityId).toBeUndefined();
  });

  it('lets a privileged role look up a specific identity_id', async () => {
    const { controller, calls } = buildController();
    const req = {} as Request;
    setAuthenticatedPrincipal(req, orgAdmin);

    await controller.list(req, undefined, undefined, undefined, 'identity-someone-else');

    expect(calls[0]?.identityId).toBe('identity-someone-else');
  });
});

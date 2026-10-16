import type { ExecutionContext } from '@nestjs/common';

import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import {
  AutomationMutationGuard,
  type AutomationMutationRequest,
} from '@presentation/http/automation-mutation.guard';

const principal = {
  identityId: '10000000-0000-4000-8000-000000000001',
  subject: 'subject-1',
  identityTenantId: 'tenant-1',
  organizationId: '20000000-0000-4000-8000-000000000001',
  organizationStatus: 'ACTIVE' as const,
  membershipId: '30000000-0000-4000-8000-000000000001',
  role: 'VIEWER' as const,
  authenticationTime: 1,
  mfaVerified: true,
  mfaRequired: true,
};

function context(): { executionContext: ExecutionContext; request: AutomationMutationRequest } {
  const request = { get: () => undefined } as unknown as AutomationMutationRequest;
  const executionContext = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { executionContext, request };
}

describe('AutomationMutationGuard', () => {
  it("assigns the browser source with the authenticated principal's identityId", () => {
    const guard = new AutomationMutationGuard();
    const { executionContext, request } = context();
    setAuthenticatedPrincipal(request, principal);

    expect(guard.canActivate(executionContext)).toBe(true);
    expect(request.automationActor).toEqual({
      source: 'browser',
      runId: null,
      identityId: principal.identityId,
    });
  });

  it('fails loudly instead of treating a missing principal as anonymous', () => {
    const guard = new AutomationMutationGuard();
    const { executionContext, request } = context();

    expect(() => guard.canActivate(executionContext)).toThrow(
      'Authenticated organization context is required',
    );
    expect(request.automationActor).toBeUndefined();
  });
});

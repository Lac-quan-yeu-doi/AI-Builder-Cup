import { describe, expect, it, vi } from 'vitest';

import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';
import { createCompleteTotpEnrollmentUseCase } from '@/src/application/use-cases/auth/complete-totp-enrollment.use-case';

describe('complete TOTP enrollment', () => {
  it('removes whitespace before forwarding the code', async () => {
    const repository = {
      completeTotpEnrollment: vi.fn(async () => undefined),
    } as unknown as IdentitySessionRepository;
    const complete = createCompleteTotpEnrollmentUseCase(repository);

    await complete(' 123 456 ');

    expect(repository.completeTotpEnrollment).toHaveBeenCalledWith('123456');
  });
});

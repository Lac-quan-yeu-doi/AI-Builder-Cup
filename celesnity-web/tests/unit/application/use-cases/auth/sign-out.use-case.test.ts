import { describe, expect, it, vi } from 'vitest';

import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';
import { createSignOutUseCase } from '@/src/application/use-cases/auth/sign-out.use-case';

describe('sign out use case', () => {
  it('ends the identity session through the repository', async () => {
    const repository: IdentitySessionRepository = {
      authenticationMode: vi.fn(async () => 'identity-platform' as const),
      signInAsLocalPersona: vi.fn(async () => undefined),
      signIn: vi.fn(),
      completeTotp: vi.fn(),
      completeTotpEnrollment: vi.fn(),
      beginPasswordChange: vi.fn(),
      completePasswordChange: vi.fn(),
      signOut: vi.fn(async () => undefined),
    };

    await expect(createSignOutUseCase(repository)()).resolves.toBeUndefined();
    expect(repository.signOut).toHaveBeenCalledTimes(1);
  });
});

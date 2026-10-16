import type { ConfigService } from '@nestjs/config';

import { AgentWorkloadIdentityVerifier } from '@presentation/http/agent-workload-identity.verifier';
import { OAuth2Client, LoginTicket } from 'google-auth-library';

// Select the promise overload; the SDK also exposes a callback/void overload.
const workloadVerifier = OAuth2Client.prototype as unknown as {
  verifyIdToken(input: { idToken: string; audience: string }): Promise<LoginTicket>;
};

function makeVerifier(): AgentWorkloadIdentityVerifier {
  const config = {
    getOrThrow: (key: string) =>
      key === 'AGENT_SERVICE_AUDIENCE' ? 'https://core.test' : 'agent@test.iam.gserviceaccount.com',
  } as unknown as ConfigService;
  return new AgentWorkloadIdentityVerifier(config);
}

describe('AgentWorkloadIdentityVerifier', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the fixed audience and accepts only the configured verified service account', async () => {
    const verify = jest.spyOn(workloadVerifier, 'verifyIdToken').mockResolvedValue(new LoginTicket('', {
      iss: 'https://accounts.google.com', aud: 'https://core.test', sub: 'workload-1',
      iat: 1, exp: 9999999999, email: 'agent@test.iam.gserviceaccount.com', email_verified: true,
    }));
    await expect(makeVerifier().verifyIdentity('signed-token')).resolves.toMatchObject({ subject: 'workload-1' });
    expect(verify).toHaveBeenCalledWith({ idToken: 'signed-token', audience: 'https://core.test' });
  });

  it('rejects another service account even when its token signature is valid', async () => {
    jest.spyOn(workloadVerifier, 'verifyIdToken').mockResolvedValue(new LoginTicket('', {
      iss: 'https://accounts.google.com', aud: 'https://core.test', sub: 'other-workload',
      iat: 1, exp: 9999999999, email: 'other@test.iam.gserviceaccount.com', email_verified: true,
    }));
    await expect(makeVerifier().verifyIdentity('signed-token')).resolves.toBeNull();
  });

  it('fails closed when Google rejects the audience or expiry', async () => {
    jest.spyOn(workloadVerifier, 'verifyIdToken').mockRejectedValue(new Error('wrong audience or expired'));
    await expect(makeVerifier().verifyIdentity('signed-token')).resolves.toBeNull();
  });
  it('rejects an empty token without attempting verification', async () => {
    await expect(makeVerifier().verify('')).resolves.toBe(false);
  });

  it('rejects a malformed token rather than throwing', async () => {
    await expect(makeVerifier().verify('not-a-real-jwt')).resolves.toBe(false);
  });
});

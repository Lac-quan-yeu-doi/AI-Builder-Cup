import { randomBytes } from 'node:crypto';

import type { IClock } from '@application/shared/interfaces/i-clock';
import { HmacOAuthStateCodec } from '@infrastructure/security/oauth-connection/hmac-oauth-state-codec';

describe('HmacOAuthStateCodec', () => {
  const keyring = `v1:${randomBytes(32).toString('base64')},v2:${randomBytes(32).toString('base64')}`;
  let now: Date;
  const clock: IClock = { now: () => now };
  const codec = (activeKeyVersion = 'v1'): HmacOAuthStateCodec =>
    new HmacOAuthStateCodec({ keyring, activeKeyVersion }, clock);

  beforeEach(() => {
    now = new Date('2026-09-25T10:00:00Z');
  });

  it('round-trips the payload for the same provider', () => {
    const state = codec().encode({ identityId: 'id-1', provider: 'google-drive', returnTo: '/chat' });

    expect(codec().decode(state, 'google-drive')).toEqual({
      identityId: 'id-1',
      provider: 'google-drive',
      returnTo: '/chat',
    });
  });

  it('never exposes a bare identity id as the state', () => {
    expect(codec().encode({ identityId: 'id-1', provider: 'google-drive' })).not.toBe('id-1');
  });

  it('rejects a forged identity id', () => {
    const [version, body, signature] = codec().encode({ identityId: 'id-1', provider: 'google-drive' }).split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')), i: 'attacker' }),
    ).toString('base64url');

    expect(codec().decode(`${version}.${forged}.${signature}`, 'google-drive')).toBeUndefined();
  });

  it('rejects a raw identity id, the format used before signing', () => {
    expect(codec().decode('9a3c5c2e-1111-4a4a-8888-000000000000', 'google-drive')).toBeUndefined();
  });

  it('rejects a state issued for another provider', () => {
    const state = codec().encode({ identityId: 'id-1', provider: 'gmail' });

    expect(codec().decode(state, 'google-drive')).toBeUndefined();
  });

  it('rejects an expired state', () => {
    const state = codec().encode({ identityId: 'id-1', provider: 'google-drive' });
    now = new Date(now.getTime() + 11 * 60_000);

    expect(codec().decode(state, 'google-drive')).toBeUndefined();
  });

  it('still accepts a state signed with a previous key version after rotation', () => {
    const state = codec('v1').encode({ identityId: 'id-1', provider: 'google-drive' });

    expect(codec('v2').decode(state, 'google-drive')?.identityId).toBe('id-1');
  });
});

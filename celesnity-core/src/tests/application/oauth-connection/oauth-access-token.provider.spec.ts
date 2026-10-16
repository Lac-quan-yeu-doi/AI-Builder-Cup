import {
  OAuthConnectionError,
  OAuthConnectionErrorCode,
  OAuthGrantRevokedError,
} from '@application/oauth-connection/errors/oauth-connection.error';
import type {
  IOAuthConnectionStore,
  StoredOAuthConnection,
} from '@application/oauth-connection/i-oauth-connection-store';
import type { IOAuthTokenRefresher } from '@application/oauth-connection/i-oauth-token-refresher';
import { OAuthAccessTokenProvider } from '@application/oauth-connection/oauth-access-token.provider';

const NOW = new Date('2026-09-25T10:00:00Z');

function connection(overrides: Partial<StoredOAuthConnection> = {}): StoredOAuthConnection {
  return {
    id: 'c-1',
    identityId: 'id-1',
    provider: 'google-drive',
    externalAccountId: 'sub-1',
    status: 'ACTIVE',
    accessToken: 'old-access',
    refreshToken: 'refresh-1',
    tokenExpiresAt: new Date(NOW.getTime() - 1000),
    scopes: ['openid'],
    email: 'a@example.com',
    connectedAt: NOW,
    ...overrides,
  };
}

describe('OAuthAccessTokenProvider', () => {
  let store: jest.Mocked<IOAuthConnectionStore>;
  let refresher: jest.Mocked<IOAuthTokenRefresher>;
  let provider: OAuthAccessTokenProvider;

  beforeEach(() => {
    store = {
      save: jest.fn().mockResolvedValue(undefined),
      findByIdentityAndProvider: jest.fn(),
      deleteByIdentityAndProvider: jest.fn(),
      markNeedsReauth: jest.fn().mockResolvedValue(undefined),
    };
    refresher = { providers: ['google-drive'], refresh: jest.fn() };
    provider = new OAuthAccessTokenProvider(store, [refresher], { now: () => NOW });
  });

  const expectCode = async (code: OAuthConnectionErrorCode): Promise<void> => {
    const error: unknown = await provider.getAccessToken('id-1', 'google-drive').catch((e: unknown) => e);
    expect(OAuthConnectionError.is(error, code)).toBe(true);
  };

  it('returns a still-valid token without refreshing', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(
      connection({ tokenExpiresAt: new Date(NOW.getTime() + 10 * 60_000) }),
    );

    await expect(provider.getAccessToken('id-1', 'google-drive')).resolves.toBe('old-access');
    expect(refresher.refresh).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and keeps the existing refresh token', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(connection());
    refresher.refresh.mockResolvedValue({
      accessToken: 'new-access',
      expiresAt: new Date(NOW.getTime() + 3600_000),
    });

    await expect(provider.getAccessToken('id-1', 'google-drive')).resolves.toBe('new-access');
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: expect.objectContaining({ accessToken: 'new-access', refreshToken: 'refresh-1' }) as unknown,
      }),
    );
  });

  it('marks the connection NEEDS_REAUTH when the grant is revoked', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(connection());
    refresher.refresh.mockRejectedValue(new OAuthGrantRevokedError());

    await expectCode(OAuthConnectionErrorCode.NEEDS_REAUTH);
    expect(store.markNeedsReauth).toHaveBeenCalledWith('id-1', 'google-drive');
  });

  it('does not mark the connection on a transient refresh failure', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(connection());
    refresher.refresh.mockRejectedValue(new Error('socket hang up'));

    await expectCode(OAuthConnectionErrorCode.PROVIDER_UNAVAILABLE);
    expect(store.markNeedsReauth).not.toHaveBeenCalled();
  });

  it('marks NEEDS_REAUTH when an expired connection has no refresh token', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(connection({ refreshToken: undefined }));

    await expectCode(OAuthConnectionErrorCode.NEEDS_REAUTH);
    expect(store.markNeedsReauth).toHaveBeenCalled();
  });

  it('refuses a connection already waiting for sign-in', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(connection({ status: 'NEEDS_REAUTH' }));

    await expectCode(OAuthConnectionErrorCode.NEEDS_REAUTH);
    expect(refresher.refresh).not.toHaveBeenCalled();
  });

  it('reports NOT_CONNECTED when there is no connection', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(undefined);

    await expectCode(OAuthConnectionErrorCode.NOT_CONNECTED);
  });

  it('reports PROVIDER_UNSUPPORTED when no refresher serves the provider', async () => {
    store.findByIdentityAndProvider.mockResolvedValue(connection({ provider: 'onedrive' }));

    const error: unknown = await provider.getAccessToken('id-1', 'onedrive').catch((e: unknown) => e);
    expect(OAuthConnectionError.is(error, OAuthConnectionErrorCode.PROVIDER_UNSUPPORTED)).toBe(true);
  });
});

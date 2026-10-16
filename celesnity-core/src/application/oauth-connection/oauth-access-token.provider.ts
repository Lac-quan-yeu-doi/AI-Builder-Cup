import type { IClock } from '@application/shared/interfaces/i-clock';
import { OAuthConnectionError, OAuthGrantRevokedError } from './errors/oauth-connection.error';
import type { IOAuthAccessTokenProvider } from './i-oauth-access-token-provider';
import type { IOAuthConnectionStore } from './i-oauth-connection-store';
import type { IOAuthTokenRefresher } from './i-oauth-token-refresher';

const EXPIRY_SKEW_MS = 60_000;

export class OAuthAccessTokenProvider implements IOAuthAccessTokenProvider {
  private readonly refreshers: ReadonlyMap<string, IOAuthTokenRefresher>;

  public constructor(
    private readonly store: IOAuthConnectionStore,
    refreshers: readonly IOAuthTokenRefresher[],
    private readonly clock: IClock,
  ) {
    this.refreshers = new Map(
      refreshers.flatMap((refresher) => refresher.providers.map((provider) => [provider, refresher])),
    );
  }

  public async getAccessToken(identityId: string, provider: string): Promise<string> {
    const stored = await this.store.findByIdentityAndProvider(identityId, provider);
    if (!stored) throw OAuthConnectionError.notConnected(provider);
    if (stored.status === 'NEEDS_REAUTH') throw OAuthConnectionError.needsReauth(provider);
    if (stored.tokenExpiresAt.getTime() - EXPIRY_SKEW_MS > this.clock.now().getTime()) {
      return stored.accessToken;
    }

    if (!stored.refreshToken) {
      await this.store.markNeedsReauth(identityId, provider);
      throw OAuthConnectionError.needsReauth(provider);
    }
    const refresher = this.refreshers.get(provider);
    if (!refresher) throw OAuthConnectionError.providerUnsupported(provider);

    let refreshed;
    try {
      refreshed = await refresher.refresh(stored.refreshToken);
    } catch (error) {
      if (error instanceof OAuthGrantRevokedError) {
        await this.store.markNeedsReauth(identityId, provider);
        throw OAuthConnectionError.needsReauth(provider);
      }
      throw OAuthConnectionError.providerUnavailable(
        provider,
        `Could not refresh ${provider} access: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.store.save({
      identityId,
      provider,
      externalAccountId: stored.externalAccountId,
      tokens: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? stored.refreshToken,
        expiresAt: refreshed.expiresAt,
      },
      scopes: [...stored.scopes],
      email: stored.email,
    });
    return refreshed.accessToken;
  }
}

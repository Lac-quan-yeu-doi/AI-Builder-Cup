import type { OAuthTokens } from './i-oauth-connection-store';

export interface IOAuthTokenRefresher {
  readonly providers: readonly string[];
  refresh(refreshToken: string): Promise<OAuthTokens>;
}

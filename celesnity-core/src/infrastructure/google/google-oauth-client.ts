import { OAuth2Client } from 'google-auth-library';

import type {
  IGoogleOAuthClient,
  GoogleExchangeResult,
} from '@application/google-drive-connector/interfaces/i-google-oauth-client';
import { OAuthGrantRevokedError } from '@application/oauth-connection/errors/oauth-connection.error';
import type { OAuthTokens } from '@application/oauth-connection/i-oauth-connection-store';
import type { IOAuthTokenRefresher } from '@application/oauth-connection/i-oauth-token-refresher';

export interface GoogleOAuthClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly providers: readonly string[];
}

export class GoogleOAuthClientImpl implements IGoogleOAuthClient, IOAuthTokenRefresher {
  public readonly providers: readonly string[];
  private readonly client: OAuth2Client;

  public constructor(private readonly config: GoogleOAuthClientConfig) {
    this.providers = config.providers;
    this.client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  }

  public generateAuthUrl(scopes: readonly string[], state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes as string[],
      prompt: 'consent',
      state,
    });
  }

  public async exchangeCode(code: string): Promise<GoogleExchangeResult> {
    const { tokens } = await this.client.getToken(code);

    let externalAccountId = 'unknown';
    let email: string | undefined;

    if (tokens.id_token) {
      const parts = tokens.id_token.split('.');
      if (parts[1]) {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf8'),
        ) as { sub?: string; email?: string };
        externalAccountId = payload.sub ?? externalAccountId;
        email = payload.email;
      }
    }

    const grantedScopes = typeof tokens.scope === 'string'
      ? tokens.scope.split(' ').filter(Boolean)
      : [];

    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: new Date(tokens.expiry_date!),
      externalAccountId,
      email,
      grantedScopes,
    };
  }

  public async refresh(refreshToken: string): Promise<OAuthTokens> {
    const client = new OAuth2Client(this.config.clientId, this.config.clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    try {
      const { credentials } = await client.refreshAccessToken();
      return {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token ?? undefined,
        expiresAt: new Date(credentials.expiry_date!),
      };
    } catch (error) {
      if (isInvalidGrant(error)) throw new OAuthGrantRevokedError();
      throw error;
    }
  }
}

function isInvalidGrant(error: unknown): boolean {
  const data = (error as { response?: { data?: { error?: unknown } } } | undefined)?.response?.data;
  return data?.error === 'invalid_grant';
}

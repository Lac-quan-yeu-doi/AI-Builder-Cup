export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: Date;
}

export interface StoredOAuthConnection {
  readonly id: string;
  readonly identityId: string;
  readonly provider: string;
  readonly externalAccountId: string;
  readonly status: 'ACTIVE' | 'NEEDS_REAUTH' | 'REVOKED';
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenExpiresAt: Date;
  readonly scopes: readonly string[];
  readonly email?: string;
  readonly connectedAt: Date;
}

export interface SaveOAuthConnectionParams {
  readonly identityId: string;
  readonly provider: string;
  readonly externalAccountId: string;
  readonly tokens: OAuthTokens;
  readonly scopes: readonly string[];
  readonly email?: string;
}

export interface IOAuthConnectionStore {
  save(params: SaveOAuthConnectionParams): Promise<void>;
  findByIdentityAndProvider(
    identityId: string,
    provider: string,
  ): Promise<StoredOAuthConnection | undefined>;
  deleteByIdentityAndProvider(identityId: string, provider: string): Promise<void>;
  markNeedsReauth(identityId: string, provider: string): Promise<void>;
}

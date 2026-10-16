export interface GoogleTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt: Date;
}

export interface GoogleExchangeResult extends GoogleTokens {
  readonly externalAccountId: string;
  readonly email?: string;
  readonly grantedScopes: readonly string[];
}

export interface IGoogleOAuthClient {
  generateAuthUrl(scopes: readonly string[], state: string): string;
  exchangeCode(code: string): Promise<GoogleExchangeResult>;
}

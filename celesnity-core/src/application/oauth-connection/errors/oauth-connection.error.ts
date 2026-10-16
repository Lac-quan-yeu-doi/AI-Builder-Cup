export enum OAuthConnectionErrorCode {
  NOT_CONNECTED = 'NOT_CONNECTED',
  NEEDS_REAUTH = 'NEEDS_REAUTH',
  PROVIDER_UNSUPPORTED = 'PROVIDER_UNSUPPORTED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
}

export class OAuthConnectionError extends Error {
  public readonly code: OAuthConnectionErrorCode;
  public readonly provider: string;

  public constructor(code: OAuthConnectionErrorCode, provider: string, message: string) {
    super(message);
    this.name = 'OAuthConnectionError';
    this.code = code;
    this.provider = provider;
  }

  public static notConnected(provider: string): OAuthConnectionError {
    return new OAuthConnectionError(
      OAuthConnectionErrorCode.NOT_CONNECTED,
      provider,
      `${provider} is not connected.`,
    );
  }

  public static needsReauth(provider: string): OAuthConnectionError {
    return new OAuthConnectionError(
      OAuthConnectionErrorCode.NEEDS_REAUTH,
      provider,
      `${provider} sign-in has expired. Sign in again to continue.`,
    );
  }

  public static providerUnsupported(provider: string): OAuthConnectionError {
    return new OAuthConnectionError(
      OAuthConnectionErrorCode.PROVIDER_UNSUPPORTED,
      provider,
      `No token refresher is registered for ${provider}.`,
    );
  }

  public static providerUnavailable(provider: string, message: string): OAuthConnectionError {
    return new OAuthConnectionError(OAuthConnectionErrorCode.PROVIDER_UNAVAILABLE, provider, message);
  }

  public static is(
    error: unknown,
    ...codes: readonly OAuthConnectionErrorCode[]
  ): error is OAuthConnectionError {
    return (
      error instanceof OAuthConnectionError && (codes.length === 0 || codes.includes(error.code))
    );
  }
}

export class OAuthGrantRevokedError extends Error {
  public constructor(message = 'The OAuth grant was revoked or expired.') {
    super(message);
    this.name = 'OAuthGrantRevokedError';
  }
}

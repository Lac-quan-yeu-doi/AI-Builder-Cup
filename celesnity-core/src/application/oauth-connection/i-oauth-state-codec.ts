export interface OAuthStatePayload {
  readonly identityId: string;
  readonly provider: string;
  readonly returnTo?: string;
}

export interface IOAuthStateCodec {
  encode(payload: OAuthStatePayload): string;
  decode(state: string, expectedProvider: string): OAuthStatePayload | undefined;
}

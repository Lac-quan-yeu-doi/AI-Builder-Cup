export interface IOAuthAccessTokenProvider {
  getAccessToken(identityId: string, provider: string): Promise<string>;
}

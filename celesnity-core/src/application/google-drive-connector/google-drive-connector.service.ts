import type { IGoogleOAuthClient } from './interfaces/i-google-oauth-client';
import type { ICloudFileSource } from '@application/cloud-file/interfaces/i-cloud-file-source';
import type { IOAuthConnectionStore } from '@application/oauth-connection/i-oauth-connection-store';
import type { IOAuthStateCodec } from '@application/oauth-connection/i-oauth-state-codec';
import type {
  GoogleDriveStatusView,
  GoogleDriveFileView,
} from './read-models/google-drive-connector.view';

export const GOOGLE_DRIVE_PROVIDER = 'google-drive';

const DRIVE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
] as const;

export type GoogleDriveCallbackOutcome = 'connected' | 'invalid_state';

export class GoogleDriveConnectorService {
  public constructor(
    private readonly oauthClient: IGoogleOAuthClient,
    private readonly connectionStore: IOAuthConnectionStore,
    private readonly stateCodec: IOAuthStateCodec,
    private readonly fileSource: ICloudFileSource,
  ) {}

  public getAuthUrl(identityId: string): string {
    const state = this.stateCodec.encode({ identityId, provider: GOOGLE_DRIVE_PROVIDER });
    return this.oauthClient.generateAuthUrl(DRIVE_SCOPES, state);
  }

  public async handleCallback(state: string, code: string): Promise<GoogleDriveCallbackOutcome> {
    const payload = this.stateCodec.decode(state, GOOGLE_DRIVE_PROVIDER);
    if (!payload) return 'invalid_state';
    const result = await this.oauthClient.exchangeCode(code);
    await this.connectionStore.save({
      identityId: payload.identityId,
      provider: GOOGLE_DRIVE_PROVIDER,
      externalAccountId: result.externalAccountId,
      tokens: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
      },
      scopes: result.grantedScopes,
      email: result.email,
    });
    return 'connected';
  }

  public async status(identityId: string): Promise<GoogleDriveStatusView> {
    const stored = await this.connectionStore.findByIdentityAndProvider(
      identityId,
      GOOGLE_DRIVE_PROVIDER,
    );
    const checkedAt = new Date().toISOString();
    if (!stored) return { status: 'not_connected', checkedAt };
    if (stored.status === 'NEEDS_REAUTH') {
      return { status: 'needs_sign_in', email: stored.email, checkedAt };
    }
    return { status: 'connected', email: stored.email, checkedAt };
  }

  public async disconnect(identityId: string): Promise<void> {
    await this.connectionStore.deleteByIdentityAndProvider(identityId, GOOGLE_DRIVE_PROVIDER);
  }

  public async listFiles(
    identityId: string,
    query?: string,
  ): Promise<readonly GoogleDriveFileView[]> {
    const page = await this.fileSource.search(identityId, { text: query, pageSize: 20 });
    return page.files.map((file) => ({
      id: file.fileId,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      size: file.sizeBytes === undefined ? undefined : String(file.sizeBytes),
      webViewLink: file.webUrl,
    }));
  }
}

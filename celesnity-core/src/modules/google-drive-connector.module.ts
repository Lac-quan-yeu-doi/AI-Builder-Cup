import { Module } from '@nestjs/common';

import type { ICloudFileSourceRegistry } from '@application/cloud-file/interfaces/i-cloud-file-source-registry';
import { CLOUD_FILE_SOURCE_REGISTRY } from '@application/cloud-file/tokens';
import {
  GOOGLE_DRIVE_PROVIDER,
  GoogleDriveConnectorService,
} from '@application/google-drive-connector/google-drive-connector.service';
import type { IGoogleOAuthClient } from '@application/google-drive-connector/interfaces/i-google-oauth-client';
import { GOOGLE_OAUTH_CLIENT } from '@application/google-drive-connector/tokens';
import type { IOAuthConnectionStore } from '@application/oauth-connection/i-oauth-connection-store';
import type { IOAuthStateCodec } from '@application/oauth-connection/i-oauth-state-codec';
import { OAUTH_CONNECTION_STORE, OAUTH_STATE_CODEC } from '@application/oauth-connection/tokens';
import { CloudFileModule } from '@modules/cloud-file.module';
import { OAuthConnectionModule } from '@modules/oauth-connection.module';
import { GoogleDriveConnectorController } from '@presentation/google-drive-connector/google-drive-connector.controller';

@Module({
  imports: [OAuthConnectionModule, CloudFileModule],
  controllers: [GoogleDriveConnectorController],
  providers: [
    {
      provide: GoogleDriveConnectorService,
      inject: [GOOGLE_OAUTH_CLIENT, OAUTH_CONNECTION_STORE, OAUTH_STATE_CODEC, CLOUD_FILE_SOURCE_REGISTRY],
      useFactory: (
        oauthClient: IGoogleOAuthClient,
        connectionStore: IOAuthConnectionStore,
        stateCodec: IOAuthStateCodec,
        sources: ICloudFileSourceRegistry,
      ): GoogleDriveConnectorService =>
        new GoogleDriveConnectorService(
          oauthClient,
          connectionStore,
          stateCodec,
          sources.get(GOOGLE_DRIVE_PROVIDER),
        ),
    },
  ],
})
export class GoogleDriveConnectorModule {}

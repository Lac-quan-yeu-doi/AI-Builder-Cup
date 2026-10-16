import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IGoogleOAuthClient } from '@application/google-drive-connector/interfaces/i-google-oauth-client';
import { GOOGLE_OAUTH_CLIENT } from '@application/google-drive-connector/tokens';
import type { IOAuthConnectionStore } from '@application/oauth-connection/i-oauth-connection-store';
import type { IOAuthTokenRefresher } from '@application/oauth-connection/i-oauth-token-refresher';
import { OAuthAccessTokenProvider } from '@application/oauth-connection/oauth-access-token.provider';
import {
  OAUTH_ACCESS_TOKEN_PROVIDER,
  OAUTH_CONNECTION_STORE,
  OAUTH_STATE_CODEC,
  OAUTH_TOKEN_REFRESHERS,
} from '@application/oauth-connection/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { CLOCK } from '@application/shared/tokens';
import {
  GoogleOAuthClientImpl,
  type GoogleOAuthClientConfig,
} from '@infrastructure/google/google-oauth-client';
import { PrismaOAuthConnectionStore } from '@infrastructure/prisma/oauth-connection/prisma-oauth-connection.store';
import { AesOAuthTokenVault } from '@infrastructure/security/oauth-connection/aes-oauth-token-vault';
import { HmacOAuthStateCodec } from '@infrastructure/security/oauth-connection/hmac-oauth-state-codec';
import { SystemClock } from '@infrastructure/system/system-clock';

const GOOGLE_PROVIDERS = ['google-drive'] as const;

@Module({
  providers: [
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
    AesOAuthTokenVault,
    PrismaOAuthConnectionStore,
    { provide: OAUTH_CONNECTION_STORE, useExisting: PrismaOAuthConnectionStore },
    {
      provide: GoogleOAuthClientImpl,
      inject: [ConfigService],
      useFactory: (config: ConfigService): GoogleOAuthClientImpl | null => {
        const clientId = config.get<string>('GOOGLE_OAUTH_CLIENT_ID', '');
        const clientSecret = config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET', '');
        if (!clientId || !clientSecret) return null;
        return new GoogleOAuthClientImpl({
          clientId,
          clientSecret,
          redirectUri: `${config.getOrThrow<string>('WEB_ORIGIN')}/api/oauth/google-drive/callback`,
          providers: GOOGLE_PROVIDERS,
        } satisfies GoogleOAuthClientConfig);
      },
    },
    {
      provide: GOOGLE_OAUTH_CLIENT,
      inject: [GoogleOAuthClientImpl],
      useFactory: (client: GoogleOAuthClientImpl | null): IGoogleOAuthClient => {
        if (client) return client;
        const message =
          'Google connectors are disabled: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are not set.';
        return {
          generateAuthUrl: (): never => { throw new Error(message); },
          exchangeCode: (): never => { throw new Error(message); },
        };
      },
    },
    {
      provide: OAUTH_TOKEN_REFRESHERS,
      inject: [GoogleOAuthClientImpl],
      useFactory: (google: GoogleOAuthClientImpl | null): readonly IOAuthTokenRefresher[] =>
        google ? [google] : [],
    },
    {
      provide: OAUTH_ACCESS_TOKEN_PROVIDER,
      inject: [OAUTH_CONNECTION_STORE, OAUTH_TOKEN_REFRESHERS, CLOCK],
      useFactory: (
        store: IOAuthConnectionStore,
        refreshers: readonly IOAuthTokenRefresher[],
        clock: IClock,
      ): OAuthAccessTokenProvider => new OAuthAccessTokenProvider(store, refreshers, clock),
    },
    {
      provide: OAUTH_STATE_CODEC,
      inject: [ConfigService, CLOCK],
      useFactory: (config: ConfigService, clock: IClock): HmacOAuthStateCodec =>
        new HmacOAuthStateCodec(
          {
            keyring: config.getOrThrow<string>('CONNECTION_CREDENTIAL_KEYS'),
            activeKeyVersion: config.getOrThrow<string>('CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION'),
          },
          clock,
        ),
    },
  ],
  exports: [
    OAUTH_CONNECTION_STORE,
    GOOGLE_OAUTH_CLIENT,
    OAUTH_ACCESS_TOKEN_PROVIDER,
    OAUTH_STATE_CODEC,
  ],
})
export class OAuthConnectionModule {}

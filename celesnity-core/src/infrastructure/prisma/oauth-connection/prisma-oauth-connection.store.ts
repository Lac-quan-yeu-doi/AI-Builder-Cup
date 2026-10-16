import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type {
  IOAuthConnectionStore,
  SaveOAuthConnectionParams,
  StoredOAuthConnection,
} from '@application/oauth-connection/i-oauth-connection-store';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { AesOAuthTokenVault } from '@infrastructure/security/oauth-connection/aes-oauth-token-vault';

@Injectable()
export class PrismaOAuthConnectionStore implements IOAuthConnectionStore {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly vault: AesOAuthTokenVault,
  ) {}

  public async save(params: SaveOAuthConnectionParams): Promise<void> {
    const encrypted = this.vault.encrypt({
      accessToken: params.tokens.accessToken,
      refreshToken: params.tokens.refreshToken,
    });

    const providerData = params.email ? { email: params.email } : {};

    await this.prisma.client.oauthConnection.upsert({
      where: {
        identityId_provider_externalAccountId: {
          identityId: params.identityId,
          provider: params.provider,
          externalAccountId: params.externalAccountId,
        },
      },
      create: {
        id: randomUUID(),
        identityId: params.identityId,
        provider: params.provider,
        externalAccountId: params.externalAccountId,
        status: 'ACTIVE',
        scopes: [...params.scopes],
        encryptedTokenPayload: encrypted.ciphertext,
        encryptionIv: encrypted.initializationVector,
        encryptionAuthTag: encrypted.authenticationTag,
        encryptionKeyVersion: encrypted.keyVersion,
        tokenExpiresAt: params.tokens.expiresAt,
        providerData,
      },
      update: {
        status: 'ACTIVE',
        scopes: [...params.scopes],
        encryptedTokenPayload: encrypted.ciphertext,
        encryptionIv: encrypted.initializationVector,
        encryptionAuthTag: encrypted.authenticationTag,
        encryptionKeyVersion: encrypted.keyVersion,
        tokenExpiresAt: params.tokens.expiresAt,
        providerData,
      },
    });
  }

  public async findByIdentityAndProvider(
    identityId: string,
    provider: string,
  ): Promise<StoredOAuthConnection | undefined> {
    const record = await this.prisma.client.oauthConnection.findFirst({
      where: { identityId, provider, status: { in: ['ACTIVE', 'NEEDS_REAUTH'] } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!record) return undefined;

    const tokens = this.vault.decrypt({
      ciphertext: record.encryptedTokenPayload,
      initializationVector: record.encryptionIv,
      authenticationTag: record.encryptionAuthTag,
      keyVersion: record.encryptionKeyVersion,
    });

    const providerData = record.providerData as Record<string, unknown> | null;

    return {
      id: record.id,
      identityId: record.identityId,
      provider: record.provider,
      externalAccountId: record.externalAccountId,
      status: record.status,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: record.tokenExpiresAt,
      scopes: record.scopes,
      email: (providerData?.email as string) ?? undefined,
      connectedAt: record.connectedAt,
    };
  }

  public async deleteByIdentityAndProvider(
    identityId: string,
    provider: string,
  ): Promise<void> {
    await this.prisma.client.oauthConnection.updateMany({
      where: { identityId, provider },
      data: { status: 'REVOKED' },
    });
  }

  public async markNeedsReauth(identityId: string, provider: string): Promise<void> {
    await this.prisma.client.oauthConnection.updateMany({
      where: { identityId, provider, status: 'ACTIVE' },
      data: { status: 'NEEDS_REAUTH' },
    });
  }
}

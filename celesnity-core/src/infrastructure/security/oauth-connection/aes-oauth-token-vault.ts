import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedTokenPayload {
  readonly ciphertext: string;
  readonly initializationVector: string;
  readonly authenticationTag: string;
  readonly keyVersion: string;
}

export interface OAuthTokenPayload {
  readonly accessToken: string;
  readonly refreshToken?: string;
}

@Injectable()
export class AesOAuthTokenVault {
  private readonly activeVersion: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(config: ConfigService) {
    this.activeVersion = config.getOrThrow<string>('CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION');
    this.keys = parseKeyring(config.getOrThrow<string>('CONNECTION_CREDENTIAL_KEYS'));
  }

  public encrypt(tokens: OAuthTokenPayload): EncryptedTokenPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.requireKey(this.activeVersion), iv);
    cipher.setAAD(this.aad(this.activeVersion));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(tokens), 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString('base64'),
      initializationVector: iv.toString('base64'),
      authenticationTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.activeVersion,
    };
  }

  public decrypt(encrypted: EncryptedTokenPayload): OAuthTokenPayload {
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.requireKey(encrypted.keyVersion),
        Buffer.from(encrypted.initializationVector, 'base64'),
      );
      decipher.setAAD(this.aad(encrypted.keyVersion));
      decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(plaintext) as OAuthTokenPayload;
    } catch {
      throw new Error('Stored OAuth tokens could not be decrypted.');
    }
  }

  private requireKey(version: string): Buffer {
    const key = this.keys.get(version);
    if (key === undefined) throw new Error('Stored OAuth tokens use an unavailable key.');
    return key;
  }

  private aad(version: string): Buffer {
    return Buffer.from(`celesnity:oauth-connection:${version}`, 'utf8');
  }
}

function parseKeyring(value: string): ReadonlyMap<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const entry of value.split(',')) {
    const separator = entry.indexOf(':');
    const version = entry.slice(0, separator).trim();
    const key = Buffer.from(entry.slice(separator + 1).trim(), 'base64');
    if (separator < 1 || key.length !== 32) throw new Error('Invalid credential keyring.');
    keys.set(version, key);
  }
  return keys;
}

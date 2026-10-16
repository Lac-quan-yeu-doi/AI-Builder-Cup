import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IStreamingCredentialVault } from '@application/streaming/interfaces/i-streaming-credential-vault';
import type { StoredMqttCredentials } from '@domain/streaming/models/mqtt-stream-adapter';

const ALGORITHM = 'aes-256-gcm';

@Injectable()
export class AesStreamingCredentialVault implements IStreamingCredentialVault {
  private readonly activeVersion: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(config: ConfigService) {
    this.activeVersion = config.getOrThrow<string>('CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION');
    this.keys = parseKeyring(config.getOrThrow<string>('CONNECTION_CREDENTIAL_KEYS'));
  }

  public encrypt(credentials: Readonly<Record<string, string>>): Promise<StoredMqttCredentials> {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      ALGORITHM,
      this.requireKey(this.activeVersion),
      initializationVector,
    );
    cipher.setAAD(this.aad(this.activeVersion));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    return Promise.resolve({
      ciphertext: ciphertext.toString('base64'),
      initializationVector: initializationVector.toString('base64'),
      authenticationTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.activeVersion,
    });
  }

  public decrypt(reference: StoredMqttCredentials): Promise<Readonly<Record<string, string>>> {
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.requireKey(reference.keyVersion),
        Buffer.from(reference.initializationVector, 'base64'),
      );
      decipher.setAAD(this.aad(reference.keyVersion));
      decipher.setAuthTag(Buffer.from(reference.authenticationTag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(reference.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return Promise.resolve(JSON.parse(plaintext) as Readonly<Record<string, string>>);
    } catch {
      throw new Error('Stored MQTT credentials could not be decrypted.');
    }
  }

  private requireKey(version: string): Buffer {
    const key = this.keys.get(version);
    if (key === undefined) throw new Error('Stored MQTT credentials use an unavailable key.');
    return key;
  }

  private aad(version: string): Buffer {
    return Buffer.from(`celesnity:mqtt-stream-adapter:${version}`, 'utf8');
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

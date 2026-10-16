import type { StoredMqttCredentials } from '@domain/streaming/models/mqtt-stream-adapter';

export interface IStreamingCredentialVault {
  encrypt(credentials: Readonly<Record<string, string>>): Promise<StoredMqttCredentials>;
  decrypt(reference: StoredMqttCredentials): Promise<Readonly<Record<string, string>>>;
}

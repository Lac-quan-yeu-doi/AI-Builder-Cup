import type { CredentialReference } from '@domain/database-service/value-objects/connection-value-objects';

export interface ICredentialVault {
  encrypt(plaintext: string): Promise<CredentialReference>;
  decrypt(reference: CredentialReference): Promise<string>;
}

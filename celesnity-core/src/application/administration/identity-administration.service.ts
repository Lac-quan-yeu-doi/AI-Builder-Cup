export interface ProvisionedIdentityUser {
  readonly subject: string;
  readonly email: string;
  readonly setupLink?: string;
  readonly created: boolean;
}

export interface IdentityAdministrationService {
  provisionUser(identityTenantId: string, email: string): Promise<ProvisionedIdentityUser>;
  deleteUser(identityTenantId: string, subject: string): Promise<void>;
  enableMfa(identityTenantId: string): Promise<void>;
}

export const IDENTITY_ADMINISTRATION_SERVICE = Symbol('IDENTITY_ADMINISTRATION_SERVICE');

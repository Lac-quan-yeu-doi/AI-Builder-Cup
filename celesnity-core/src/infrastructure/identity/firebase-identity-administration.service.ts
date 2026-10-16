import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type TenantManager } from 'firebase-admin/auth';

import type {
  IdentityAdministrationService,
  ProvisionedIdentityUser,
} from '@application/administration/identity-administration.service';

@Injectable()
export class FirebaseIdentityAdministrationService implements IdentityAdministrationService {
  private readonly tenants: TenantManager;

  public constructor(config: ConfigService) {
    const projectId = config.getOrThrow<string>('IDENTITY_PLATFORM_PROJECT_ID');
    const app = appForProject(projectId);
    this.tenants = getAuth(app).tenantManager();
  }

  public async provisionUser(
    identityTenantId: string,
    email: string,
  ): Promise<ProvisionedIdentityUser> {
    const auth = this.tenants.authForTenant(identityTenantId);
    const normalized = email.trim().toLowerCase();
    try {
      const existing = await auth.getUserByEmail(normalized);
      return { subject: existing.uid, email: normalized, created: false };
    } catch (error) {
      if (firebaseErrorCode(error) !== 'auth/user-not-found') throw error;
    }
    const created = await auth.createUser({
      email: normalized,
      emailVerified: false,
      disabled: false,
    });
    try {
      const setupLink = await auth.generatePasswordResetLink(normalized);
      return { subject: created.uid, email: normalized, setupLink, created: true };
    } catch (error) {
      await auth.deleteUser(created.uid).catch(() => {});
      throw error;
    }
  }

  public async deleteUser(identityTenantId: string, subject: string): Promise<void> {
    try {
      await this.tenants.authForTenant(identityTenantId).deleteUser(subject);
    } catch (error) {
      if (firebaseErrorCode(error) !== 'auth/user-not-found') throw error;
    }
  }

  public async enableMfa(identityTenantId: string): Promise<void> {
    await this.tenants.updateTenant(identityTenantId, {
      multiFactorConfig: {
        state: 'ENABLED',
        providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }],
      },
    });
  }
}

function appForProject(projectId: string): App {
  return (
    getApps().find((candidate) => candidate.options.projectId === projectId) ??
    initializeApp({ credential: applicationDefault(), projectId })
  );
}

function firebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

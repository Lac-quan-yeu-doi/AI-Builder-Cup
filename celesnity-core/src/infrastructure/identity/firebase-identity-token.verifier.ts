import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken, type TenantManager } from 'firebase-admin/auth';

import type {
  IdentityTokenVerifier,
  VerifiedIdentityToken,
} from '@application/administration/identity-token.verifier';

@Injectable()
export class FirebaseIdentityTokenVerifier implements IdentityTokenVerifier {
  private readonly tenants: TenantManager;

  public constructor(config: ConfigService) {
    const projectId = config.getOrThrow<string>('IDENTITY_PLATFORM_PROJECT_ID');
    this.tenants = getAuth(existingOrInitializeApp(projectId)).tenantManager();
  }

  public async verify(token: string): Promise<VerifiedIdentityToken> {
    const decoded = await this.verifyIdentityOrSessionToken(token);
    return {
      subject: decoded.sub,
      tenantId: requiredTenantId(decoded),
      email: decoded.email,
      displayName: typeof decoded.name === 'string' ? decoded.name : undefined,
      emailVerified: decoded.email_verified === true,
      sessionId: typeof decoded.session_id === 'string' ? decoded.session_id : undefined,
      authenticationTime: decoded.auth_time,
      mfaVerified: hasSecondFactor(decoded),
    };
  }

  private async verifyIdentityOrSessionToken(token: string): Promise<DecodedIdToken> {
    const auth = this.tenants.authForTenant(unverifiedTenantId(token));
    try {
      return await auth.verifySessionCookie(token, true);
    } catch {
      return auth.verifyIdToken(token, true);
    }
  }
}

function unverifiedTenantId(token: string): string {
  if (Buffer.byteLength(token, 'utf8') > 16_384) throw new Error('Identity token is invalid');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) throw new Error('Identity token is invalid');
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      firebase?: { tenant?: unknown };
    };
    const tenantId = payload.firebase?.tenant;
    if (typeof tenantId !== 'string' || tenantId.length === 0 || tenantId.length > 128) {
      throw new Error('Identity token is not bound to an Identity Platform tenant');
    }
    return tenantId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Identity token is not bound'))
      throw error;
    throw new Error('Identity token is invalid', { cause: error });
  }
}

function requiredTenantId(token: DecodedIdToken): string {
  const firebase = token.firebase as { tenant?: string } | undefined;
  if (typeof firebase?.tenant !== 'string' || firebase.tenant === '') {
    throw new Error('Identity token is not bound to an Identity Platform tenant');
  }
  return firebase.tenant;
}

function existingOrInitializeApp(projectId: string): App {
  const existing = getApps().find((candidate) => candidate.options.projectId === projectId);
  return existing ?? initializeApp({ credential: applicationDefault(), projectId });
}

function hasSecondFactor(token: DecodedIdToken): boolean {
  const firebase = token.firebase as { sign_in_second_factor?: string } | undefined;
  return firebase?.sign_in_second_factor === 'totp';
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { AgentWorkloadIdentity } from '@application/administration/agent-service-access.repository';

/**
 * Verifies a Google-signed workload-identity ID token belongs to this
 * deployment's configured agent service account — the same audience/email
 * check `AgentServiceGuard` performs for message-blocks, factored out so
 * routes with no room to bind a principal to (charts, documents — global
 * resources, not room-scoped) can reuse it without a roomId.
 */
@Injectable()
export class AgentWorkloadIdentityVerifier {
  private readonly audience: string;
  private readonly serviceAccountEmail: string;
  private readonly client = new OAuth2Client();

  public constructor(config: ConfigService) {
    this.audience = config.getOrThrow<string>('AGENT_SERVICE_AUDIENCE');
    this.serviceAccountEmail = config.getOrThrow<string>('AGENT_SERVICE_ACCOUNT_EMAIL');
  }

  /**
   * Returns `true` only for an unexpired Google ID token issued to this
   * deployment's agent service account. Never throws — an invalid, expired,
   * or absent token simply isn't an agent token, which callers fall back
   * from to normal human authentication rather than treating as an error.
   */
  public async verify(token: string): Promise<boolean> {
    return (await this.verifyIdentity(token)) !== null;
  }

  public async verifyIdentity(token: string): Promise<AgentWorkloadIdentity | null> {
    if (token === '') return null;
    try {
      const ticket = await this.client.verifyIdToken({ idToken: token, audience: this.audience });
      const payload = ticket.getPayload();
      if (
        payload?.email !== this.serviceAccountEmail ||
        payload.email_verified !== true ||
        payload.sub === undefined
      ) {
        return null;
      }
      return {
        subject: payload.sub,
        email: payload.email,
        authenticationTime: payload.iat ?? 0,
      };
    } catch {
      return null;
    }
  }
}

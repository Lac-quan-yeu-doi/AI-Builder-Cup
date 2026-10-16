import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  AGENT_SERVICE_ACCESS_REPOSITORY,
  type AgentServiceAccessRepository,
} from '@application/administration/agent-service-access.repository';
import { setAuthenticatedPrincipal } from './authenticated-request';
import { McpSharedSecretGuard } from '@presentation/mcp/mcp-shared-secret.guard';

@Injectable()
export class AgentServiceGuard implements CanActivate {
  private readonly audience: string;
  private readonly serviceAccountEmail: string;
  private readonly allowLocalSharedSecret: boolean;
  private readonly verifier = new OAuth2Client();

  public constructor(
    config: ConfigService,
    @Inject(AGENT_SERVICE_ACCESS_REPOSITORY)
    private readonly access: AgentServiceAccessRepository,
    private readonly mcpSharedSecret: McpSharedSecretGuard,
  ) {
    this.audience = config.getOrThrow<string>('AGENT_SERVICE_AUDIENCE');
    this.serviceAccountEmail = config.getOrThrow<string>('AGENT_SERVICE_ACCOUNT_EMAIL');
    this.allowLocalSharedSecret = config.getOrThrow<string>('NODE_ENV') !== 'production';
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const roomId = request.params.roomId;
    if (typeof roomId !== 'string' || roomId.trim() === '') throw unauthenticated();

    // Local Docker has no metadata server from which the agent can mint a
    // workload-identity token. Reuse the already configured MCP secret only
    // outside production, while still resolving the bound room below so the
    // organization boundary remains enforced by the repository.
    if (this.allowLocalSharedSecret && this.mcpSharedSecret.canActivate(context)) {
      const principal = await this.access.resolveRoomPrincipal(roomId, {
        subject: 'local-mcp-agent',
        email: this.serviceAccountEmail,
        authenticationTime: Math.floor(Date.now() / 1_000),
      });
      if (principal === null) throw unauthenticated();
      setAuthenticatedPrincipal(request, principal);
      return true;
    }

    const authorization = request.get('Authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';
    if (token === '') throw unauthenticated();
    try {
      const ticket = await this.verifier.verifyIdToken({ idToken: token, audience: this.audience });
      const payload = ticket.getPayload();
      if (
        payload?.email !== this.serviceAccountEmail ||
        payload.email_verified !== true ||
        payload.sub === undefined
      )
        throw unauthenticated();
      const principal = await this.access.resolveRoomPrincipal(roomId, {
        subject: payload.sub,
        email: payload.email,
        authenticationTime: payload.iat ?? 0,
      });
      if (principal === null) throw unauthenticated();
      setAuthenticatedPrincipal(request, principal);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw unauthenticated();
    }
    return true;
  }
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'A valid Celesnity agent workload identity is required.',
    details: null,
  });
}

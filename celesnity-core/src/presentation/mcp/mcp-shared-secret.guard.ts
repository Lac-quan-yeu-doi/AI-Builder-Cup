import { timingSafeEqual } from 'node:crypto';

import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const SHARED_SECRET_HEADER = 'x-mcp-shared-secret';

/**
 * Static shared-secret auth for the agent-only MCP endpoints (chart/document
 * tool access). Unlike `ChartAgentAuthGuard`'s per-call GCP workload-identity
 * token, this secret is long-lived (a k8s Secret) — the MCP `Remote`
 * transport's headers are resolved once at agent-manifest load and never
 * refreshed, so a token with Google's ~1hr expiry isn't usable here. See
 * `MCP_SHARED_SECRET` in `environment.ts`.
 */
@Injectable()
export class McpSharedSecretGuard implements CanActivate {
  private readonly secret: Buffer;

  public constructor(config: ConfigService) {
    this.secret = Buffer.from(config.getOrThrow<string>('MCP_SHARED_SECRET'));
  }

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.get(SHARED_SECRET_HEADER);
    if (header === undefined) return false;

    const provided = Buffer.from(header);
    // Constant-time compare needs equal-length buffers; a length mismatch
    // already proves it's wrong, so short-circuit rather than padding.
    return provided.length === this.secret.length && timingSafeEqual(provided, this.secret);
  }
}

import { Controller, Header, Inject, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
  type MinderPrincipalAssertionIssuer,
} from '@application/administration/minder-principal-assertion';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { CLOCK } from '@application/shared/tokens';
import { RequirePermission } from '@presentation/http/required-permission.decorator';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('administration')
@Controller('administration')
@RequireWorkspaceFeature('HOME')
export class MinderPrincipalAssertionController {
  public constructor(
    private readonly contexts: AuthenticatedContextStore,
    @Inject(MINDER_PRINCIPAL_ASSERTION_ISSUER)
    private readonly issuer: MinderPrincipalAssertionIssuer,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  /**
   * Exchanges the globally authenticated Core request context for a short-lived
   * Minder resource-server credential. This is deliberately a POST because it
   * mints a fresh one-use assertion, but it requires read-only workspace access.
   */
  @Post('minder-principal-assertion')
  @RequirePermission('workspace:read')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      required: ['token', 'expires_at'],
      properties: {
        token: { type: 'string' },
        expires_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  public issue(): { token: string; expires_at: string } {
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1_000);
    const token = this.issuer.issue(this.contexts.require(), nowSeconds);
    return {
      token,
      expires_at: new Date(this.issuer.expiresAt(nowSeconds) * 1_000).toISOString(),
    };
  }
}

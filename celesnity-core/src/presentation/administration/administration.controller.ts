import {
  Controller,
  Get,
  Header,
  Param,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AdministrationUseCases } from '@application/administration/administration.use-cases';
import { RequirePermission } from '@presentation/http/required-permission.decorator';
import { Public } from '@presentation/http/public.decorator';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { OrganizationSlugParamsDto } from './administration.dto';

@ApiTags('administration')
@Controller('administration')
@RequireWorkspaceFeature('ADMINISTRATION')
export class AdministrationController {
  public constructor(private readonly administration: AdministrationUseCases) {}

  // First-factor login needs this non-secret policy before a full session exists.
  // No membership, email or other organization data is returned.
  @Public()
  @Get('mfa-policy/:identityTenantId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['mfaRequired'],
      properties: { mfaRequired: { type: 'boolean' } },
    },
  })
  public mfaPolicy(
    @Param('identityTenantId') identityTenantId: string,
  ): Promise<{ mfaRequired: boolean }> {
    return this.administration.mfaPolicy(identityTenantId);
  }

  @Public()
  @Get('login-context/:organizationSlug')
  @Header('Cache-Control', 'no-store')
  public loginContext(
    @Param() params: OrganizationSlugParamsDto,
  ): Promise<{ identityTenantId: string; mfaRequired: boolean }> {
    return this.administration.loginContext(params.organizationSlug);
  }

  @Get('me')
  @RequirePermission('organization:read')
  @RequireWorkspaceFeature()
  public me(): Promise<unknown> {
    return this.administration.me();
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AdministrationUseCases } from '@application/administration/administration.use-cases';
import { RequirePermission } from '@presentation/http/required-permission.decorator';
import { Public } from '@presentation/http/public.decorator';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  AuditQueryDto,
  AuthorizationGroupParamsDto,
  AuthorizationGroupMemberParamsDto,
  CatalogGrantParamsDto,
  CreateAuthorizationGroupDto,
  CreateCatalogGrantDto,
  CreateInvitationDto,
  MembershipParamsDto,
  OrganizationSlugParamsDto,
  UpdateMembershipDto,
  UpdateAuthorizationGroupFeaturesDto,
  UpdateAgentServiceIdentityDto,
} from './administration.dto';

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
  @Get('organizations/current')
  @RequirePermission('organization:read')
  public organization(): Promise<unknown> {
    return this.administration.currentOrganization();
  }
  @Post('organizations/current/mfa-policy/enable')
  @RequirePermission('organization:manage')
  public enableMfa(): Promise<unknown> {
    return this.administration.enableMfa();
  }
  @Get('memberships')
  @RequirePermission('organization:manage')
  public memberships(): Promise<unknown> {
    return this.administration.listMemberships();
  }
  @Post('invitations') @RequirePermission('organization:manage') public invite(
    @Body() body: CreateInvitationDto,
  ): Promise<unknown> {
    return this.administration.invite(body.email, body.role, body.expiresInHours);
  }
  @Patch('memberships/:membershipId')
  @RequirePermission('organization:manage')
  public updateMembership(
    @Param() params: MembershipParamsDto,
    @Body() body: UpdateMembershipDto,
  ): Promise<unknown> {
    return this.administration.updateMembership(params.membershipId, body.role, body.status);
  }
  @Delete('memberships/:membershipId/account')
  @RequirePermission('organization:manage')
  public removeAccount(@Param() params: MembershipParamsDto): Promise<void> {
    return this.administration.removeAccount(params.membershipId);
  }
  @Get('audit-events') @RequirePermission('audit:read') public audit(
    @Query() query: AuditQueryDto,
  ): Promise<unknown> {
    return this.administration.listAuditEvents(query.limit);
  }

  @Get('authorization/groups')
  @RequirePermission('organization:manage')
  public groups(): Promise<unknown> {
    return this.administration.listGroups();
  }

  @Post('authorization/groups')
  @RequirePermission('organization:manage')
  public createGroup(@Body() body: CreateAuthorizationGroupDto): Promise<unknown> {
    return this.administration.createGroup(body.name, body.description);
  }

  @Put('authorization/groups/:groupId/members/:identityId')
  @RequirePermission('organization:manage')
  public addGroupMember(@Param() params: AuthorizationGroupMemberParamsDto): Promise<unknown> {
    return this.administration.addGroupMember(params.groupId, params.identityId);
  }

  @Delete('authorization/groups/:groupId/members/:identityId')
  @RequirePermission('organization:manage')
  public removeGroupMember(@Param() params: AuthorizationGroupMemberParamsDto): Promise<void> {
    return this.administration.removeGroupMember(params.groupId, params.identityId);
  }

  @Put('authorization/groups/:groupId/features')
  @RequirePermission('organization:manage')
  public updateGroupFeatures(
    @Param() params: AuthorizationGroupParamsDto,
    @Body() body: UpdateAuthorizationGroupFeaturesDto,
  ): Promise<unknown> {
    return this.administration.updateGroupFeatures(params.groupId, body.visibleFeatures);
  }

  @Get('authorization/catalog-grants')
  @RequirePermission('organization:manage')
  public catalogGrants(): Promise<unknown> {
    return this.administration.listCatalogGrants();
  }

  @Get('authorization/service-identities')
  @RequirePermission('organization:manage')
  public serviceIdentities(): Promise<unknown> {
    return this.administration.listServiceIdentities();
  }

  @Put('authorization/service-identities/agent')
  @RequirePermission('organization:manage')
  public updateAgentServiceIdentity(@Body() body: UpdateAgentServiceIdentityDto): Promise<unknown> {
    return this.administration.updateAgentServiceIdentity(body);
  }

  @Post('authorization/catalog-grants')
  @RequirePermission('organization:manage')
  public createCatalogGrant(@Body() body: CreateCatalogGrantDto): Promise<unknown> {
    return this.administration.createCatalogGrant({
      ...(body.groupId === undefined ? {} : { groupId: body.groupId }),
      ...(body.identityId === undefined ? {} : { identityId: body.identityId }),
      ...(body.agentName === undefined ? {} : { agentName: body.agentName }),
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      permissions: body.permissions,
      effect: body.effect,
      includeDescendants: body.includeDescendants,
      grantOption: body.grantOption,
      ...(body.validFrom === undefined ? {} : { validFrom: new Date(body.validFrom) }),
      ...(body.expiresAt === undefined ? {} : { expiresAt: new Date(body.expiresAt) }),
    });
  }

  @Delete('authorization/catalog-grants/:grantId')
  @RequirePermission('organization:manage')
  public deleteCatalogGrant(@Param() params: CatalogGrantParamsDto): Promise<void> {
    return this.administration.deleteCatalogGrant(params.grantId);
  }
}

import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  WORKSPACE_FEATURES,
  type WorkspaceFeature,
} from '@application/administration/workspace-feature';

export class OrganizationSlugParamsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,62}$/)
  public organizationSlug!: string;
}

export enum OrganizationRoleDto {
  ORG_OWNER = 'ORG_OWNER',
  ORG_ADMIN = 'ORG_ADMIN',
  DATA_ENGINEER = 'DATA_ENGINEER',
  ANALYST = 'ANALYST',
  VIEWER = 'VIEWER',
  AUDITOR = 'AUDITOR',
}

export class CreateInvitationDto {
  @IsEmail() public email!: string;
  @IsEnum(OrganizationRoleDto) public role!: OrganizationRoleDto;
  @Type(() => Number) @IsInt() @Min(1) @Max(168) public expiresInHours = 72;
}

export class UpdateMembershipDto {
  @ApiProperty({ enum: OrganizationRoleDto })
  @IsEnum(OrganizationRoleDto)
  public role!: OrganizationRoleDto;
  @ApiProperty({ enum: ['ACTIVE', 'REVOKED'] })
  @IsEnum(['ACTIVE', 'REVOKED'])
  public status!: 'ACTIVE' | 'REVOKED';
}

export class MembershipParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public membershipId!: string;
}

export class AuditQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(500) public limit = 100;
}

export enum CatalogResourceTypeDto {
  CATALOG = 'CATALOG',
  DATABASE = 'DATABASE',
  SCHEMA = 'SCHEMA',
  TABLE = 'TABLE',
  COLUMN = 'COLUMN',
}
export enum CatalogPermissionDto {
  DISCOVER = 'DISCOVER',
  DESCRIBE = 'DESCRIBE',
  PREVIEW = 'PREVIEW',
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EXECUTE = 'EXECUTE',
  ALTER = 'ALTER',
  GRANT = 'GRANT',
  OWN = 'OWN',
}
export enum PolicyEffectDto {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
}

export class CreateAuthorizationGroupDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  public name!: string;
  @IsOptional() @IsString() @Length(0, 500) public description?: string;
}
export class AuthorizationGroupMemberParamsDto {
  @IsUUID() public groupId!: string;
  @IsUUID() public identityId!: string;
}
export class AuthorizationGroupParamsDto {
  @IsUUID() public groupId!: string;
}
export class UpdateAuthorizationGroupFeaturesDto {
  @ApiProperty({ enum: WORKSPACE_FEATURES, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(WORKSPACE_FEATURES, { each: true })
  public visibleFeatures!: WorkspaceFeature[];
}
export class CreateCatalogGrantDto {
  @ValidateIf(
    (value: CreateCatalogGrantDto) =>
      value.identityId === undefined && value.agentName === undefined,
  )
  @IsUUID()
  public groupId?: string;
  @ValidateIf(
    (value: CreateCatalogGrantDto) => value.groupId === undefined && value.agentName === undefined,
  )
  @IsUUID()
  public identityId?: string;
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{0,119}$/)
  public agentName?: string;
  @IsEnum(CatalogResourceTypeDto) public resourceType!: CatalogResourceTypeDto;
  @IsString() @Length(1, 500) public resourceId!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(CatalogPermissionDto, { each: true })
  public permissions!: CatalogPermissionDto[];
  @IsEnum(PolicyEffectDto) public effect: PolicyEffectDto = PolicyEffectDto.ALLOW;
  @IsBoolean() public includeDescendants = false;
  @IsBoolean() public grantOption = false;
  @IsOptional() @IsDateString() public validFrom?: string;
  @IsOptional() @IsDateString() public expiresAt?: string;
}
export class CatalogGrantParamsDto {
  @IsUUID() public grantId!: string;
}

export class UpdateAgentServiceIdentityDto {
  @IsBoolean() public enabled!: boolean;
  @IsArray()
  @ArrayUnique()
  @IsIn(['workspace:read', 'workspace:write'], { each: true })
  public permissions!: ('workspace:read' | 'workspace:write')[];
  @IsArray()
  @ArrayUnique()
  @IsIn(WORKSPACE_FEATURES, { each: true })
  public features!: WorkspaceFeature[];
}

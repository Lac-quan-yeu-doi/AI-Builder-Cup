import type { OrganizationRole } from './authenticated-context';

export type Permission =
  | 'workspace:read'
  | 'workspace:write'
  | 'organization:read'
  | 'organization:manage'
  | 'audit:read'
  | 'support:access';

const ROLE_PERMISSIONS: Readonly<Record<OrganizationRole, ReadonlySet<Permission>>> = {
  PLATFORM_ADMIN: new Set([
    'workspace:read',
    'workspace:write',
    'organization:read',
    'organization:manage',
    'audit:read',
    'support:access',
  ]),
  SUPPORT: new Set(['organization:read', 'audit:read', 'support:access']),
  ORG_OWNER: new Set([
    'workspace:read',
    'workspace:write',
    'organization:read',
    'organization:manage',
    'audit:read',
  ]),
  ORG_ADMIN: new Set([
    'workspace:read',
    'workspace:write',
    'organization:read',
    'organization:manage',
    'audit:read',
  ]),
  DATA_ENGINEER: new Set(['workspace:read', 'workspace:write', 'organization:read']),
  ANALYST: new Set(['workspace:read', 'workspace:write', 'organization:read']),
  VIEWER: new Set(['workspace:read', 'organization:read']),
  AUDITOR: new Set(['organization:read', 'audit:read']),
  SERVICE_ACCOUNT: new Set(['workspace:read', 'workspace:write']),
};

export function roleAllows(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) === true;
}

export function isPrivileged(role: OrganizationRole): boolean {
  return (
    role === 'PLATFORM_ADMIN' || role === 'SUPPORT' || role === 'ORG_OWNER' || role === 'ORG_ADMIN'
  );
}

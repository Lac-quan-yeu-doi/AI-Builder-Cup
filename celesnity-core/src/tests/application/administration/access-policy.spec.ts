import { decideAccess } from '@application/administration/access-policy';
import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import { mcpOperationPermission } from '@application/administration/mcp-operation-policy';

const principal: AuthenticatedContext = {
  identityId: 'user-a',
  subject: 'subject-a',
  identityTenantId: 'tenant-a',
  organizationId: 'org-a',
  organizationStatus: 'ACTIVE',
  membershipId: 'member-a',
  role: 'VIEWER',
  mfaRequired: true,
  mfaVerified: true,
  authenticationTime: 1,
  visibleFeatures: ['DOCUMENTS'],
};

describe('Shared access policy', () => {
  it('intersects role and feature access rather than treating features as write grants', () => {
    expect(
      decideAccess(principal, { permission: 'workspace:write', anyFeature: ['DOCUMENTS'] }),
    ).toEqual({ allowed: false, reason: 'PERMISSION_DENIED' });
    expect(
      decideAccess(principal, { permission: 'workspace:read', anyFeature: ['DOCUMENTS'] }),
    ).toEqual({ allowed: true });
  });
  it('denies foreign organizations even for platform admins', () => {
    expect(
      decideAccess(
        { ...principal, role: 'PLATFORM_ADMIN' },
        { permission: 'workspace:read', resourceOrganizationId: 'org-b' },
      ),
    ).toEqual({ allowed: false, reason: 'ORGANIZATION_ACCESS_DENIED' });
  });
  it('denies suspended organizations, missing MFA and missing features', () => {
    expect(
      decideAccess(
        { ...principal, organizationStatus: 'SUSPENDED' },
        { permission: 'workspace:read' },
      ).allowed,
    ).toBe(false);
    expect(
      decideAccess({ ...principal, mfaVerified: false }, { permission: 'workspace:read' }),
    ).toEqual({ allowed: false, reason: 'MFA_REQUIRED' });
    expect(
      decideAccess(principal, { permission: 'workspace:read', anyFeature: ['QUERY'] }),
    ).toEqual({ allowed: false, reason: 'FEATURE_ACCESS_DENIED' });
  });
  it.each(['create_chart', 'update_chart', 'move_chart', 'remove_chart'])(
    'classifies %s as a write independently of POST transport',
    (tool) => {
      expect(mcpOperationPermission('mcp-chart', tool)).toBe('workspace:write');
    },
  );
  it('does not infer permissions from client tool names or cross-server names', () => {
    expect(mcpOperationPermission('mcp-document', 'list_documents')).toBe('workspace:read');
    expect(() => mcpOperationPermission('mcp-document', 'get_new_privileged_tool')).toThrow(
      'PERMISSION_DENIED',
    );
    expect(() => mcpOperationPermission('mcp-chart', 'list_documents')).toThrow(
      'PERMISSION_DENIED',
    );
  });
});

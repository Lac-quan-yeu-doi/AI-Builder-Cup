import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiAdministrationRepository } from '@/src/infrastructure/repositories/core-api-administration.repository';

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: { readonly path: string; readonly init?: RequestInit }[] = [];
  public constructor(private readonly responses: unknown[]) {}
  public async request<T>(path: string, init?: RequestInit): Promise<T> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    return this.responses.shift() as T;
  }
  public stream(): Promise<Response> {
    throw new Error('Not used');
  }
}

describe('CoreApiAdministrationRepository', () => {
  it('enables MFA on the current organization without accepting a tenant or policy override', async () => {
    const transport = new FakeTransport([{}]);
    await new CoreApiAdministrationRepository(transport).enableMfa();
    expect(transport.requests).toEqual([
      { path: '/administration/organizations/current/mfa-policy/enable', init: { method: 'POST' } },
    ]);
  });
  it('loads the complete governance workspace from tenant-scoped endpoints', async () => {
    const transport = new FakeTransport([[], [], []]);
    const repository = new CoreApiAdministrationRepository(transport);
    await repository.listMembers();
    await repository.listGroups();
    await repository.listCatalogGrants();
    expect(transport.requests).toEqual([
      { path: '/administration/memberships', init: { method: 'GET' } },
      { path: '/administration/authorization/groups', init: { method: 'GET' } },
      { path: '/administration/authorization/catalog-grants', init: { method: 'GET' } },
    ]);
  });

  it('uses the organization-scoped service-identity contract without granting catalog access', async () => {
    const transport = new FakeTransport([[], {}]);
    const repository = new CoreApiAdministrationRepository(transport);
    await repository.listServiceIdentities();
    await repository.updateAgentServiceIdentity({
      enabled: true,
      permissions: ['workspace:read'],
      features: ['QUERY'],
    });
    expect(transport.requests).toEqual([
      {
        path: '/administration/authorization/service-identities',
        init: { method: 'GET' },
      },
      {
        path: '/administration/authorization/service-identities/agent',
        init: {
          method: 'PUT',
          body: JSON.stringify({
            enabled: true,
            permissions: ['workspace:read'],
            features: ['QUERY'],
          }),
        },
      },
    ]);
  });

  it('sends service identity grants as identity grants, never agent-name grants', async () => {
    const transport = new FakeTransport([{}]);
    await new CoreApiAdministrationRepository(transport).createCatalogGrant({
      principalType: 'SERVICE_IDENTITY',
      principalId: 'worker-1',
      resourceType: 'TABLE',
      resourceId: 'iceberg.bronze.events',
      permissions: ['DESCRIBE'],
      effect: 'ALLOW',
      includeDescendants: false,
      grantOption: false,
    });
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      identityId: 'worker-1',
      resourceType: 'TABLE',
      resourceId: 'iceberg.bronze.events',
      permissions: ['DESCRIBE'],
      effect: 'ALLOW',
      includeDescendants: false,
      grantOption: false,
    });
  });

  it('creates a group grant with an encoded group principal in the body', async () => {
    const transport = new FakeTransport([{}]);
    const repository = new CoreApiAdministrationRepository(transport);
    await repository.createCatalogGrant({
      principalType: 'GROUP',
      principalId: 'group-id',
      resourceType: 'SCHEMA',
      resourceId: 'iceberg.curated',
      permissions: ['DISCOVER', 'SELECT'],
      effect: 'ALLOW',
      includeDescendants: true,
      grantOption: false,
    });
    expect(transport.requests[0]).toEqual({
      path: '/administration/authorization/catalog-grants',
      init: {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'group-id',
          resourceType: 'SCHEMA',
          resourceId: 'iceberg.curated',
          permissions: ['DISCOVER', 'SELECT'],
          effect: 'ALLOW',
          includeDescendants: true,
          grantOption: false,
        }),
      },
    });
  });

  it('creates an organization-agent grant without a human or group principal', async () => {
    const transport = new FakeTransport([{}]);
    await new CoreApiAdministrationRepository(transport).createCatalogGrant({
      principalType: 'AGENT',
      principalId: 'chat-assistant',
      resourceType: 'SCHEMA',
      resourceId: 'iceberg.sales',
      permissions: ['DISCOVER', 'SELECT'],
      effect: 'ALLOW',
      includeDescendants: true,
      grantOption: false,
    });
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      agentName: 'chat-assistant',
      resourceType: 'SCHEMA',
      resourceId: 'iceberg.sales',
      permissions: ['DISCOVER', 'SELECT'],
      effect: 'ALLOW',
      includeDescendants: true,
      grantOption: false,
    });
  });

  it('encodes dynamic group and member path segments', async () => {
    const transport = new FakeTransport([undefined]);
    const repository = new CoreApiAdministrationRepository(transport);
    await repository.addGroupMember({ groupId: 'group/a', identityId: 'member b' });
    expect(transport.requests[0]).toEqual({
      path: '/administration/authorization/groups/group%2Fa/members/member%20b',
      init: { method: 'PUT' },
    });
  });

  it('updates an encoded group feature policy using the exact API contract', async () => {
    const response = {
      id: 'group/a',
      name: 'Engineering managers',
      members: [],
      featureVisibilityConfigured: true,
      visibleFeatures: ['HOME', 'DEVICES'],
    };
    const transport = new FakeTransport([response]);
    const result = await new CoreApiAdministrationRepository(transport).updateGroupFeatures({
      groupId: 'group/a',
      visibleFeatures: ['HOME', 'DEVICES'],
    });
    expect(transport.requests[0]).toEqual({
      path: '/administration/authorization/groups/group%2Fa/features',
      init: {
        method: 'PUT',
        body: JSON.stringify({ visibleFeatures: ['HOME', 'DEVICES'] }),
      },
    });
    expect(result).toEqual(response);
  });

  it('removes an account through the destructive membership endpoint', async () => {
    const transport = new FakeTransport([undefined]);
    const repository = new CoreApiAdministrationRepository(transport);
    await repository.removeAccount('membership/a');
    expect(transport.requests[0]).toEqual({
      path: '/administration/memberships/membership%2Fa/account',
      init: { method: 'DELETE' },
    });
  });
});

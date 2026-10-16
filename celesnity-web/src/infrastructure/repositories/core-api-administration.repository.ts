import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type {
  AdministrationSession,
  AuthorizationGroup,
  CatalogAccessGrant,
  ChangeGroupMemberInput,
  CreateCatalogGrantInput,
  CreateGroupInput,
  InviteMemberInput,
  MemberInvitation,
  OrganizationMember,
  UpdateMemberInput,
  UpdateGroupFeaturesInput,
  ServiceIdentitySummary,
  UpdateAgentServiceIdentityInput,
} from '@/src/entities/models/administration';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

export class CoreApiAdministrationRepository implements AdministrationRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}
  public loadSession(): Promise<AdministrationSession> {
    return this.request('/administration/me', { method: 'GET' });
  }
  public async enableMfa(): Promise<void> {
    await this.request('/administration/organizations/current/mfa-policy/enable', {
      method: 'POST',
    });
  }
  public listMembers(): Promise<readonly OrganizationMember[]> {
    return this.request('/administration/memberships', { method: 'GET' });
  }
  public inviteMember(input: InviteMemberInput): Promise<MemberInvitation> {
    return this.request('/administration/invitations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  public updateMember(input: UpdateMemberInput): Promise<OrganizationMember> {
    return this.request(`/administration/memberships/${encodeURIComponent(input.membershipId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: input.role, status: input.status }),
    });
  }
  public removeAccount(membershipId: string): Promise<void> {
    return this.request(`/administration/memberships/${encodeURIComponent(membershipId)}/account`, {
      method: 'DELETE',
    });
  }
  public listGroups(): Promise<readonly AuthorizationGroup[]> {
    return this.request('/administration/authorization/groups', { method: 'GET' });
  }
  public createGroup(input: CreateGroupInput): Promise<AuthorizationGroup> {
    return this.request('/administration/authorization/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  public addGroupMember(input: ChangeGroupMemberInput): Promise<void> {
    return this.request(groupMemberPath(input), { method: 'PUT' });
  }
  public removeGroupMember(input: ChangeGroupMemberInput): Promise<void> {
    return this.request(groupMemberPath(input), { method: 'DELETE' });
  }
  public updateGroupFeatures(input: UpdateGroupFeaturesInput): Promise<AuthorizationGroup> {
    return this.request(
      `/administration/authorization/groups/${encodeURIComponent(input.groupId)}/features`,
      {
        method: 'PUT',
        body: JSON.stringify({ visibleFeatures: input.visibleFeatures }),
      },
    );
  }
  public listCatalogGrants(): Promise<readonly CatalogAccessGrant[]> {
    return this.request('/administration/authorization/catalog-grants', { method: 'GET' });
  }
  public listServiceIdentities(): Promise<readonly ServiceIdentitySummary[]> {
    return this.request('/administration/authorization/service-identities', { method: 'GET' });
  }
  public updateAgentServiceIdentity(
    input: UpdateAgentServiceIdentityInput,
  ): Promise<ServiceIdentitySummary> {
    return this.request('/administration/authorization/service-identities/agent', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }
  public createCatalogGrant(input: CreateCatalogGrantInput): Promise<CatalogAccessGrant> {
    return this.request('/administration/authorization/catalog-grants', {
      method: 'POST',
      body: JSON.stringify({
        ...(input.principalType === 'GROUP'
          ? { groupId: input.principalId }
          : input.principalType === 'MEMBER' || input.principalType === 'SERVICE_IDENTITY'
            ? { identityId: input.principalId }
            : { agentName: input.principalId }),
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        permissions: input.permissions,
        effect: input.effect,
        includeDescendants: input.includeDescendants,
        grantOption: input.grantOption,
      }),
    });
  }
  public deleteCatalogGrant(grantId: string): Promise<void> {
    return this.request(
      `/administration/authorization/catalog-grants/${encodeURIComponent(grantId)}`,
      { method: 'DELETE' },
    );
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function groupMemberPath(input: ChangeGroupMemberInput): string {
  return `/administration/authorization/groups/${encodeURIComponent(input.groupId)}/members/${encodeURIComponent(input.identityId)}`;
}

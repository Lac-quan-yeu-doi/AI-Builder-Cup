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
export interface AdministrationRepository {
  loadSession(): Promise<AdministrationSession>;
  enableMfa(): Promise<void>;
  listMembers(): Promise<readonly OrganizationMember[]>;
  inviteMember(input: InviteMemberInput): Promise<MemberInvitation>;
  updateMember(input: UpdateMemberInput): Promise<OrganizationMember>;
  removeAccount(membershipId: string): Promise<void>;
  listGroups(): Promise<readonly AuthorizationGroup[]>;
  createGroup(input: CreateGroupInput): Promise<AuthorizationGroup>;
  addGroupMember(input: ChangeGroupMemberInput): Promise<void>;
  removeGroupMember(input: ChangeGroupMemberInput): Promise<void>;
  updateGroupFeatures(input: UpdateGroupFeaturesInput): Promise<AuthorizationGroup>;
  listCatalogGrants(): Promise<readonly CatalogAccessGrant[]>;
  listServiceIdentities(): Promise<readonly ServiceIdentitySummary[]>;
  updateAgentServiceIdentity(
    input: UpdateAgentServiceIdentityInput,
  ): Promise<ServiceIdentitySummary>;
  createCatalogGrant(input: CreateCatalogGrantInput): Promise<CatalogAccessGrant>;
  deleteCatalogGrant(grantId: string): Promise<void>;
}

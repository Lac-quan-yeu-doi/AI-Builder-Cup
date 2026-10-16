import type { AddAuthorizationGroupMemberUseCase } from '@/src/application/use-cases/administration/add-authorization-group-member.use-case';
import type { CreateAuthorizationGroupUseCase } from '@/src/application/use-cases/administration/create-authorization-group.use-case';
import type { CreateCatalogGrantUseCase } from '@/src/application/use-cases/administration/create-catalog-grant.use-case';
import type { DeleteCatalogGrantUseCase } from '@/src/application/use-cases/administration/delete-catalog-grant.use-case';
import type { InviteMemberUseCase } from '@/src/application/use-cases/administration/invite-member.use-case';
import type { LoadAdministrationGovernanceUseCase } from '@/src/application/use-cases/administration/load-administration-governance.use-case';
import type { RemoveAuthorizationGroupMemberUseCase } from '@/src/application/use-cases/administration/remove-authorization-group-member.use-case';
import type { RemoveAccountUseCase } from '@/src/application/use-cases/administration/remove-account.use-case';
import type { UpdateMemberUseCase } from '@/src/application/use-cases/administration/update-member.use-case';
import type { UpdateAuthorizationGroupFeaturesUseCase } from '@/src/application/use-cases/administration/update-authorization-group-features.use-case';
import type { EnableOrganizationMfaUseCase } from '@/src/application/use-cases/administration/enable-organization-mfa.use-case';

export type EnableOrganizationMfaController = EnableOrganizationMfaUseCase;
export const createEnableOrganizationMfaController =
  (useCase: EnableOrganizationMfaUseCase): EnableOrganizationMfaController =>
  () =>
    useCase();

export type LoadAdministrationGovernanceController = LoadAdministrationGovernanceUseCase;
export const createLoadAdministrationGovernanceController = (
  useCase: LoadAdministrationGovernanceUseCase,
): LoadAdministrationGovernanceController => useCase;

export type InviteMemberController = InviteMemberUseCase;
export const createInviteMemberController = (
  useCase: InviteMemberUseCase,
): InviteMemberController => useCase;

export type UpdateMemberController = UpdateMemberUseCase;
export const createUpdateMemberController = (
  useCase: UpdateMemberUseCase,
): UpdateMemberController => useCase;

export type RemoveAccountController = RemoveAccountUseCase;
export const createRemoveAccountController = (
  useCase: RemoveAccountUseCase,
): RemoveAccountController => useCase;

export type CreateAuthorizationGroupController = CreateAuthorizationGroupUseCase;
export const createAuthorizationGroupController = (
  useCase: CreateAuthorizationGroupUseCase,
): CreateAuthorizationGroupController => useCase;

export type AddAuthorizationGroupMemberController = AddAuthorizationGroupMemberUseCase;
export const createAddAuthorizationGroupMemberController = (
  useCase: AddAuthorizationGroupMemberUseCase,
): AddAuthorizationGroupMemberController => useCase;

export type RemoveAuthorizationGroupMemberController = RemoveAuthorizationGroupMemberUseCase;
export const createRemoveAuthorizationGroupMemberController = (
  useCase: RemoveAuthorizationGroupMemberUseCase,
): RemoveAuthorizationGroupMemberController => useCase;

export type UpdateAuthorizationGroupFeaturesController = UpdateAuthorizationGroupFeaturesUseCase;
export const createUpdateAuthorizationGroupFeaturesController = (
  useCase: UpdateAuthorizationGroupFeaturesUseCase,
): UpdateAuthorizationGroupFeaturesController => useCase;

export type CreateCatalogGrantController = CreateCatalogGrantUseCase;
export const createCatalogGrantController = (
  useCase: CreateCatalogGrantUseCase,
): CreateCatalogGrantController => useCase;

export type DeleteCatalogGrantController = DeleteCatalogGrantUseCase;
export const createDeleteCatalogGrantController = (
  useCase: DeleteCatalogGrantUseCase,
): DeleteCatalogGrantController => useCase;

import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createLoadAdministrationSessionUseCase } from '@/src/application/use-cases/administration/load-administration-session.use-case';
import { CoreApiAdministrationRepository } from '@/src/infrastructure/repositories/core-api-administration.repository';
import { createLoadAdministrationSessionController } from '@/src/interface-adapters/controllers/administration/load-administration-session.controller';
import { createLoadAdministrationGovernanceUseCase } from '@/src/application/use-cases/administration/load-administration-governance.use-case';
import { createInviteMemberUseCase } from '@/src/application/use-cases/administration/invite-member.use-case';
import { createUpdateMemberUseCase } from '@/src/application/use-cases/administration/update-member.use-case';
import { createEnableOrganizationMfaUseCase } from '@/src/application/use-cases/administration/enable-organization-mfa.use-case';
import { createRemoveAccountUseCase } from '@/src/application/use-cases/administration/remove-account.use-case';
import { createAuthorizationGroupUseCase } from '@/src/application/use-cases/administration/create-authorization-group.use-case';
import { createAddAuthorizationGroupMemberUseCase } from '@/src/application/use-cases/administration/add-authorization-group-member.use-case';
import { createRemoveAuthorizationGroupMemberUseCase } from '@/src/application/use-cases/administration/remove-authorization-group-member.use-case';
import { createUpdateAuthorizationGroupFeaturesUseCase } from '@/src/application/use-cases/administration/update-authorization-group-features.use-case';
import { createCatalogGrantUseCase } from '@/src/application/use-cases/administration/create-catalog-grant.use-case';
import { createDeleteCatalogGrantUseCase } from '@/src/application/use-cases/administration/delete-catalog-grant.use-case';
import { createListServiceIdentitiesUseCase } from '@/src/application/use-cases/administration/list-service-identities.use-case';
import { createUpdateAgentServiceIdentityUseCase } from '@/src/application/use-cases/administration/update-agent-service-identity.use-case';
import {
  createListServiceIdentitiesController,
  createUpdateAgentServiceIdentityController,
} from '@/src/interface-adapters/controllers/administration/service-identities.controller';
import {
  createAddAuthorizationGroupMemberController,
  createAuthorizationGroupController,
  createCatalogGrantController,
  createDeleteCatalogGrantController,
  createInviteMemberController,
  createLoadAdministrationGovernanceController,
  createRemoveAuthorizationGroupMemberController,
  createRemoveAccountController,
  createUpdateMemberController,
  createUpdateAuthorizationGroupFeaturesController,
  createEnableOrganizationMfaController,
} from '@/src/interface-adapters/controllers/administration/administration-governance.controller';

export function createAdministrationModule() {
  const administrationModule = createTypedModule();
  administrationModule
    .bind(DI_SYMBOLS.AdministrationRepository)
    .toClass(CoreApiAdministrationRepository, [DI_SYMBOLS.CoreApiClient]);
  administrationModule
    .bind(DI_SYMBOLS.EnableOrganizationMfaUseCase)
    .toHigherOrderFunction(createEnableOrganizationMfaUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.EnableOrganizationMfaController)
    .toHigherOrderFunction(createEnableOrganizationMfaController, [
      DI_SYMBOLS.EnableOrganizationMfaUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.LoadAdministrationSessionUseCase)
    .toHigherOrderFunction(createLoadAdministrationSessionUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.LoadAdministrationSessionController)
    .toHigherOrderFunction(createLoadAdministrationSessionController, [
      DI_SYMBOLS.LoadAdministrationSessionUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.LoadAdministrationGovernanceUseCase)
    .toHigherOrderFunction(createLoadAdministrationGovernanceUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.InviteMemberUseCase)
    .toHigherOrderFunction(createInviteMemberUseCase, [DI_SYMBOLS.AdministrationRepository]);
  administrationModule
    .bind(DI_SYMBOLS.UpdateMemberUseCase)
    .toHigherOrderFunction(createUpdateMemberUseCase, [DI_SYMBOLS.AdministrationRepository]);
  administrationModule
    .bind(DI_SYMBOLS.RemoveAccountUseCase)
    .toHigherOrderFunction(createRemoveAccountUseCase, [DI_SYMBOLS.AdministrationRepository]);
  administrationModule
    .bind(DI_SYMBOLS.CreateAuthorizationGroupUseCase)
    .toHigherOrderFunction(createAuthorizationGroupUseCase, [DI_SYMBOLS.AdministrationRepository]);
  administrationModule
    .bind(DI_SYMBOLS.AddAuthorizationGroupMemberUseCase)
    .toHigherOrderFunction(createAddAuthorizationGroupMemberUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.RemoveAuthorizationGroupMemberUseCase)
    .toHigherOrderFunction(createRemoveAuthorizationGroupMemberUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.UpdateAuthorizationGroupFeaturesUseCase)
    .toHigherOrderFunction(createUpdateAuthorizationGroupFeaturesUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.CreateCatalogGrantUseCase)
    .toHigherOrderFunction(createCatalogGrantUseCase, [DI_SYMBOLS.AdministrationRepository]);
  administrationModule
    .bind(DI_SYMBOLS.DeleteCatalogGrantUseCase)
    .toHigherOrderFunction(createDeleteCatalogGrantUseCase, [DI_SYMBOLS.AdministrationRepository]);
  administrationModule
    .bind(DI_SYMBOLS.ListServiceIdentitiesUseCase)
    .toHigherOrderFunction(createListServiceIdentitiesUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.UpdateAgentServiceIdentityUseCase)
    .toHigherOrderFunction(createUpdateAgentServiceIdentityUseCase, [
      DI_SYMBOLS.AdministrationRepository,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.LoadAdministrationGovernanceController)
    .toHigherOrderFunction(createLoadAdministrationGovernanceController, [
      DI_SYMBOLS.LoadAdministrationGovernanceUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.InviteMemberController)
    .toHigherOrderFunction(createInviteMemberController, [DI_SYMBOLS.InviteMemberUseCase]);
  administrationModule
    .bind(DI_SYMBOLS.UpdateMemberController)
    .toHigherOrderFunction(createUpdateMemberController, [DI_SYMBOLS.UpdateMemberUseCase]);
  administrationModule
    .bind(DI_SYMBOLS.RemoveAccountController)
    .toHigherOrderFunction(createRemoveAccountController, [DI_SYMBOLS.RemoveAccountUseCase]);
  administrationModule
    .bind(DI_SYMBOLS.CreateAuthorizationGroupController)
    .toHigherOrderFunction(createAuthorizationGroupController, [
      DI_SYMBOLS.CreateAuthorizationGroupUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.AddAuthorizationGroupMemberController)
    .toHigherOrderFunction(createAddAuthorizationGroupMemberController, [
      DI_SYMBOLS.AddAuthorizationGroupMemberUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.RemoveAuthorizationGroupMemberController)
    .toHigherOrderFunction(createRemoveAuthorizationGroupMemberController, [
      DI_SYMBOLS.RemoveAuthorizationGroupMemberUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.UpdateAuthorizationGroupFeaturesController)
    .toHigherOrderFunction(createUpdateAuthorizationGroupFeaturesController, [
      DI_SYMBOLS.UpdateAuthorizationGroupFeaturesUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.CreateCatalogGrantController)
    .toHigherOrderFunction(createCatalogGrantController, [DI_SYMBOLS.CreateCatalogGrantUseCase]);
  administrationModule
    .bind(DI_SYMBOLS.DeleteCatalogGrantController)
    .toHigherOrderFunction(createDeleteCatalogGrantController, [
      DI_SYMBOLS.DeleteCatalogGrantUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.ListServiceIdentitiesController)
    .toHigherOrderFunction(createListServiceIdentitiesController, [
      DI_SYMBOLS.ListServiceIdentitiesUseCase,
    ]);
  administrationModule
    .bind(DI_SYMBOLS.UpdateAgentServiceIdentityController)
    .toHigherOrderFunction(createUpdateAgentServiceIdentityController, [
      DI_SYMBOLS.UpdateAgentServiceIdentityUseCase,
    ]);
  return administrationModule;
}

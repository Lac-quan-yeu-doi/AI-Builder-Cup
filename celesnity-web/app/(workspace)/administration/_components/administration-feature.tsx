'use client';

import { getInjection } from '@/di/container';
import { AdministrationScreen } from './administration-screen';

const controllers = Object.freeze({
  load: getInjection('LoadAdministrationGovernanceController'),
  enableMfa: getInjection('EnableOrganizationMfaController'),
  invite: getInjection('InviteMemberController'),
  updateMember: getInjection('UpdateMemberController'),
  removeAccount: getInjection('RemoveAccountController'),
  createGroup: getInjection('CreateAuthorizationGroupController'),
  addGroupMember: getInjection('AddAuthorizationGroupMemberController'),
  removeGroupMember: getInjection('RemoveAuthorizationGroupMemberController'),
  updateGroupFeatures: getInjection('UpdateAuthorizationGroupFeaturesController'),
  createGrant: getInjection('CreateCatalogGrantController'),
  deleteGrant: getInjection('DeleteCatalogGrantController'),
  listAgentManifests: getInjection('ListAgentManifestsController'),
  getAgentManifest: getInjection('GetAgentManifestController'),
  saveAgentManifest: getInjection('SaveAgentManifestController'),
  validateAgentManifest: getInjection('ValidateAgentManifestController'),
  deleteAgentManifest: getInjection('DeleteAgentManifestController'),
});

export function AdministrationFeature() {
  return <AdministrationScreen controllers={controllers} />;
}

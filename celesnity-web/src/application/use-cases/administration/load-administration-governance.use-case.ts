import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { AdministrationGovernance } from '@/src/entities/models/administration';

export type LoadAdministrationGovernanceUseCase = () => Promise<AdministrationGovernance>;

export const createLoadAdministrationGovernanceUseCase =
  (repository: AdministrationRepository): LoadAdministrationGovernanceUseCase =>
  async (): Promise<AdministrationGovernance> => {
    const session = await repository.loadSession();
    if (!['ORG_OWNER', 'ORG_ADMIN'].includes(session.organization.role)) {
      return { session, members: [], groups: [], grants: [], serviceIdentities: [] };
    }
    const [members, groups, grants, serviceIdentities] = await Promise.all([
      repository.listMembers(),
      repository.listGroups(),
      repository.listCatalogGrants(),
      repository.listServiceIdentities(),
    ]);
    return { session, members, groups, grants, serviceIdentities };
  };

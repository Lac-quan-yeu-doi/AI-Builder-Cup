export interface DashboardPrincipal {
  readonly organizationId: string;
  readonly identityId: string;
  readonly isOrganizationAdmin: boolean;
}

export interface IDashboardCollectionAuthorizationReader {
  requireAccess(
    collectionId: string,
    principal: DashboardPrincipal,
    access: 'VIEW' | 'CURATE',
  ): Promise<void>;
}

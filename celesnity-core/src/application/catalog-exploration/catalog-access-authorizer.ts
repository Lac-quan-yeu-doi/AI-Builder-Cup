import type {
  CatalogAuthorizationDecision,
  CatalogPermission,
  CatalogResourceRef,
} from '@application/administration/catalog-authorization';

export interface CatalogAccessAuthorizer {
  authorizeCatalog(
    permission: CatalogPermission,
    hierarchy: readonly CatalogResourceRef[],
  ): Promise<CatalogAuthorizationDecision>;
}

export class CatalogAccessDeniedError extends Error {
  public constructor(public readonly reason: CatalogAuthorizationDecision['reason']) {
    super('Access to the requested catalog resource is denied.');
    this.name = 'CatalogAccessDeniedError';
  }
}

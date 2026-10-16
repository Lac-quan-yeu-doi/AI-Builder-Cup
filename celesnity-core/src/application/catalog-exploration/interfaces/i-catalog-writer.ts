import type { Namespace } from '@domain/catalog-exploration/models/catalog-models';
import type {
  CatalogName,
  NamespaceName,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';

/** Mutating catalog operations are isolated from the read-only exploration port. */
export interface ICatalogWriter {
  createNamespace(catalog: CatalogName, namespace: NamespaceName): Promise<Namespace>;
}

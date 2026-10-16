'use client';

import { getInjection } from '@/di/container';
import { PlantModelScreen } from './plant-model-screen';

const controller = getInjection('PlantModelController');
const catalogMetadata = Object.freeze({
  listCatalogs: getInjection('ListCatalogsController'),
  listNamespaces: getInjection('ListNamespacesController'),
  listTables: getInjection('ListTablesController'),
  loadTableMetadata: getInjection('LoadTableMetadataController'),
});

export function PlantModelFeature({ siteId }: { readonly siteId: string }) {
  return (
    <PlantModelScreen siteId={siteId} controller={controller} catalogMetadata={catalogMetadata} />
  );
}

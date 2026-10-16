'use client';

import { getInjection } from '@/di/container';
import { observeCreateDatabaseRequiredAction } from '@/app/_components/shared/workspace-required-actions';

import { CatalogExplorerScreen } from './catalog-explorer-screen';
import type { DeviceEventSelection } from './catalog-explorer-screen';

const controllers = Object.freeze({
  listCatalogs: getInjection('ListCatalogsController'),
  createNamespace: observeCreateDatabaseRequiredAction(getInjection('CreateNamespaceController')),
  updateNamespaceDescription: getInjection('UpdateNamespaceDescriptionController'),
  listNamespaces: getInjection('ListNamespacesController'),
  listTables: getInjection('ListTablesController'),
  loadMetadata: getInjection('LoadTableMetadataController'),
  listSnapshots: getInjection('ListTableSnapshotsController'),
  preview: getInjection('PreviewTableController'),
  monitorPreview: getInjection('MonitorTablePreviewController'),
});

interface CatalogExplorerFeatureProps {
  readonly view?: 'databases' | 'tables';
  readonly initialDeviceEvent?: DeviceEventSelection;
}

export function CatalogExplorerFeature({
  view = 'databases',
  initialDeviceEvent,
}: CatalogExplorerFeatureProps = {}) {
  return (
    <CatalogExplorerScreen
      controllers={controllers}
      view={view}
      {...(initialDeviceEvent === undefined ? {} : { initialDeviceEvent })}
    />
  );
}

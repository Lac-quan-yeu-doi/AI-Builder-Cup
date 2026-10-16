import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createListCatalogsUseCase } from '@/src/application/use-cases/catalog/list-catalogs.use-case';
import { createCreateNamespaceUseCase } from '@/src/application/use-cases/catalog/create-namespace.use-case';
import { createListNamespacesUseCase } from '@/src/application/use-cases/catalog/list-namespaces.use-case';
import { createListTableSnapshotsUseCase } from '@/src/application/use-cases/catalog/list-table-snapshots.use-case';
import { createListTablesUseCase } from '@/src/application/use-cases/catalog/list-tables.use-case';
import { createLoadTableMetadataUseCase } from '@/src/application/use-cases/catalog/load-table-metadata.use-case';
import { createMonitorTablePreviewUseCase } from '@/src/application/use-cases/catalog/monitor-table-preview.use-case';
import { createPreviewTableUseCase } from '@/src/application/use-cases/catalog/preview-table.use-case';
import { createUpdateNamespaceDescriptionUseCase } from '@/src/application/use-cases/catalog/update-namespace-description.use-case';
import { CoreApiCatalogRepository } from '@/src/infrastructure/repositories/core-api-catalog.repository';
import { createListCatalogsController } from '@/src/interface-adapters/controllers/catalog/list-catalogs.controller';
import { createCreateNamespaceController } from '@/src/interface-adapters/controllers/catalog/create-namespace.controller';
import { createListNamespacesController } from '@/src/interface-adapters/controllers/catalog/list-namespaces.controller';
import { createListTableSnapshotsController } from '@/src/interface-adapters/controllers/catalog/list-table-snapshots.controller';
import { createListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import { createLoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';
import { createMonitorTablePreviewController } from '@/src/interface-adapters/controllers/catalog/monitor-table-preview.controller';
import { createPreviewTableController } from '@/src/interface-adapters/controllers/catalog/preview-table.controller';
import { createUpdateNamespaceDescriptionController } from '@/src/interface-adapters/controllers/catalog/update-namespace-description.controller';

export function createCatalogModule() {
  const catalogModule = createTypedModule();

  catalogModule
    .bind(DI_SYMBOLS.CatalogRepository)
    .toClass(CoreApiCatalogRepository, [DI_SYMBOLS.CoreApiClient]);
  catalogModule
    .bind(DI_SYMBOLS.ListCatalogsUseCase)
    .toHigherOrderFunction(createListCatalogsUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.CreateNamespaceUseCase)
    .toHigherOrderFunction(createCreateNamespaceUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.UpdateNamespaceDescriptionUseCase)
    .toHigherOrderFunction(createUpdateNamespaceDescriptionUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.ListNamespacesUseCase)
    .toHigherOrderFunction(createListNamespacesUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.ListTablesUseCase)
    .toHigherOrderFunction(createListTablesUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.LoadTableMetadataUseCase)
    .toHigherOrderFunction(createLoadTableMetadataUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.ListTableSnapshotsUseCase)
    .toHigherOrderFunction(createListTableSnapshotsUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.PreviewTableUseCase)
    .toHigherOrderFunction(createPreviewTableUseCase, [DI_SYMBOLS.CatalogRepository]);
  catalogModule
    .bind(DI_SYMBOLS.MonitorTablePreviewUseCase)
    .toHigherOrderFunction(createMonitorTablePreviewUseCase, [
      DI_SYMBOLS.PreviewTableUseCase,
      DI_SYMBOLS.SchedulerService,
    ]);

  catalogModule
    .bind(DI_SYMBOLS.ListCatalogsController)
    .toHigherOrderFunction(createListCatalogsController, [DI_SYMBOLS.ListCatalogsUseCase]);
  catalogModule
    .bind(DI_SYMBOLS.CreateNamespaceController)
    .toHigherOrderFunction(createCreateNamespaceController, [DI_SYMBOLS.CreateNamespaceUseCase]);
  catalogModule
    .bind(DI_SYMBOLS.UpdateNamespaceDescriptionController)
    .toHigherOrderFunction(createUpdateNamespaceDescriptionController, [
      DI_SYMBOLS.UpdateNamespaceDescriptionUseCase,
    ]);
  catalogModule
    .bind(DI_SYMBOLS.ListNamespacesController)
    .toHigherOrderFunction(createListNamespacesController, [DI_SYMBOLS.ListNamespacesUseCase]);
  catalogModule
    .bind(DI_SYMBOLS.ListTablesController)
    .toHigherOrderFunction(createListTablesController, [DI_SYMBOLS.ListTablesUseCase]);
  catalogModule
    .bind(DI_SYMBOLS.LoadTableMetadataController)
    .toHigherOrderFunction(createLoadTableMetadataController, [
      DI_SYMBOLS.LoadTableMetadataUseCase,
    ]);
  catalogModule
    .bind(DI_SYMBOLS.ListTableSnapshotsController)
    .toHigherOrderFunction(createListTableSnapshotsController, [
      DI_SYMBOLS.ListTableSnapshotsUseCase,
    ]);
  catalogModule
    .bind(DI_SYMBOLS.PreviewTableController)
    .toHigherOrderFunction(createPreviewTableController, [DI_SYMBOLS.PreviewTableUseCase]);
  catalogModule
    .bind(DI_SYMBOLS.MonitorTablePreviewController)
    .toHigherOrderFunction(createMonitorTablePreviewController, [
      DI_SYMBOLS.MonitorTablePreviewUseCase,
    ]);

  return catalogModule;
}

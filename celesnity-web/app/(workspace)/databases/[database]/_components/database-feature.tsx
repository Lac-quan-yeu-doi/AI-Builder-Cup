'use client';

import { useState } from 'react';

import { getInjection } from '@/di/container';

import { DatabaseScreen, type DatabaseScreenControllers } from './database-screen';

interface DatabaseFeatureProps {
  readonly database: string;
}

export function DatabaseFeature({ database }: DatabaseFeatureProps) {
  // Frozen once: the screen holds the controllers in an effect dependency, and
  // a fresh object each render would reload the database on every keystroke
  // elsewhere on the page.
  const [controllers] = useState<DatabaseScreenControllers>(() => ({
    listCatalogs: getInjection('ListCatalogsController'),
    listTables: getInjection('ListTablesController'),
    listPipelines: getInjection('ListPipelinesController'),
    listDatabaseServices: getInjection('ListDatabaseServicesController'),
    listExecutions: getInjection('ListExecutionsController'),
    loadTableMetadata: getInjection('LoadTableMetadataController'),
    listTableSnapshots: getInjection('ListTableSnapshotsController'),
    previewTable: getInjection('PreviewTableController'),
  }));

  return <DatabaseScreen controllers={controllers} database={database} />;
}

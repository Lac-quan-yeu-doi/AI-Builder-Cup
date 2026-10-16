'use client';

import { getInjection } from '@/di/container';

import { PipelinesScreen } from './pipelines-screen';

const controllers = Object.freeze({
  list: getInjection('ListPipelinesController'),
  create: getInjection('CreatePipelineController'),
  clone: getInjection('ClonePipelineController'),
  archive: getInjection('ArchivePipelineController'),
  get: getInjection('GetPipelineController'),
  save: getInjection('SavePipelineController'),
  listDatabases: async (): Promise<readonly string[]> => {
    const catalogs = await getInjection('ListCatalogsController')();
    const namespaces = await Promise.all(
      catalogs.map((catalog) => getInjection('ListNamespacesController')(catalog.name)),
    );
    return [...new Set(namespaces.flat().map((namespace) => namespace.name))].sort();
  },
});

interface PipelineListFeatureProps {
  /** When supplied, scopes the list to this Data Catalog database. */
  readonly databaseName?: string;
  readonly embedded?: boolean;
}

export function PipelineListFeature({ databaseName, embedded }: PipelineListFeatureProps) {
  return (
    <PipelinesScreen controllers={controllers} databaseName={databaseName} embedded={embedded} />
  );
}

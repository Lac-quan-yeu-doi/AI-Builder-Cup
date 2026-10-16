'use client';

import { getInjection } from '@/di/container';
import {
  observeCreateDatabaseSourceRequiredAction,
  observeTestDatabaseConnectionRequiredAction,
} from '@/app/_components/shared/workspace-required-actions';

import { DatabaseServicesScreen } from './database-services-screen';

const controllers = Object.freeze({
  list: getInjection('ListDatabaseServicesController'),
  listAvailable: getInjection('ListAvailableDatabaseServicesController'),
  listConnectors: getInjection('ListDatabaseServiceConnectorsController'),
  get: getInjection('GetDatabaseServiceController'),
  testUnsaved: observeTestDatabaseConnectionRequiredAction(
    getInjection('TestUnsavedDatabaseServiceController'),
  ),
  testSaved: observeTestDatabaseConnectionRequiredAction(
    getInjection('TestSavedDatabaseServiceController'),
  ),
  create: observeCreateDatabaseSourceRequiredAction(
    getInjection('CreateDatabaseServiceController'),
  ),
  update: getInjection('UpdateDatabaseServiceController'),
  archive: getInjection('ArchiveDatabaseServiceController'),
  attach: getInjection('AttachDatabaseServiceController'),
  detach: getInjection('DetachDatabaseServiceController'),
  metadataCrawler: getInjection('MetadataCrawlerController'),
});

interface DatabaseServiceFeatureProps {
  /** The database this list belongs to. Omitted, it manages every source. */
  readonly databaseName?: string;
  readonly embedded?: boolean;
}

export function DatabaseServiceFeature({ databaseName, embedded }: DatabaseServiceFeatureProps) {
  return (
    <DatabaseServicesScreen
      controllers={controllers}
      databaseName={databaseName}
      embedded={embedded}
    />
  );
}

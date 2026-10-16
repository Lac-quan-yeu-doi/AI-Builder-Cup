'use client';

import { useState } from 'react';

import { getInjection } from '@/di/container';
import {
  observeAssignMetadataCrawlerRequiredAction,
  observeRunMetadataCrawlerRequiredAction,
  observeTestDatabaseConnectionRequiredAction,
} from '@/app/_components/shared/workspace-required-actions';

import { SourceScreen, type SourceScreenControllers } from './source-screen';

interface SourceFeatureProps {
  readonly databaseName: string;
  readonly sourceId: string;
}

export function SourceFeature({ databaseName, sourceId }: SourceFeatureProps) {
  const [controllers] = useState<SourceScreenControllers>(() => {
    const metadataCrawler = getInjection('MetadataCrawlerController');
    return {
      getDatabaseService: getInjection('GetDatabaseServiceController'),
      testDatabaseService: observeTestDatabaseConnectionRequiredAction(
        getInjection('TestSavedDatabaseServiceController'),
      ),
      metadataCrawler: {
        ...metadataCrawler,
        assign: observeAssignMetadataCrawlerRequiredAction(metadataCrawler.assign),
        runNow: observeRunMetadataCrawlerRequiredAction(metadataCrawler.runNow),
      },
      cdcConnection: getInjection('CdcConnectionProfileController'),
      sourceMetadata: getInjection('SourceMetadataController'),
    };
  });

  return <SourceScreen controllers={controllers} databaseName={databaseName} sourceId={sourceId} />;
}

'use client';

import { getInjection } from '@/di/container';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { SourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';
import type { GetDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/get-database-service.controller';
import { SourceMetadataExplorerScreen } from '@/app/_components/metadata-crawler/source-metadata-explorer-screen';

interface Props {
  readonly crawlerId: string;
}

const crawlerController = getInjection('MetadataCrawlerController');
const sourceMetadataController = getInjection('SourceMetadataController');
// Only the standalone page needs it: the source it came from is the way back,
// and the crawler alone does not know which database its source is filed under.
const getDatabaseServiceController = getInjection('GetDatabaseServiceController');

export function SourceMetadataFeature({ crawlerId }: Props) {
  return (
    <SourceMetadataExplorerScreen
      crawlerId={crawlerId}
      crawlerController={crawlerController as MetadataCrawlerController}
      getDatabaseService={getDatabaseServiceController as GetDatabaseServiceController}
      sourceController={sourceMetadataController as SourceMetadataController}
    />
  );
}

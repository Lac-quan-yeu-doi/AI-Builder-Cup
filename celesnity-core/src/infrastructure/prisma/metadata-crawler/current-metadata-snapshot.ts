import type { Prisma } from '@generated/prisma/client';
import { MetadataCrawlerRunStatus } from '@generated/prisma/enums';

export const CURRENT_METADATA_SNAPSHOT_STATUSES = [
  MetadataCrawlerRunStatus.SUCCEEDED,
  MetadataCrawlerRunStatus.PARTIAL,
] as const;

/**
 * Defines the one snapshot contract shared by catalog browsing and pipeline
 * source validation. The run must belong to the crawler currently assigned to
 * the Database Service, and that crawler must still be active.
 */
export function currentMetadataSnapshotRunWhere(
  databaseServiceId: string,
): Prisma.MetadataCrawlerRunWhereInput {
  return {
    status: { in: [...CURRENT_METADATA_SNAPSHOT_STATUSES] },
    crawler: {
      enabled: true,
      archivedAt: null,
      databaseMetadataCrawler: { databaseServiceId },
    },
  };
}

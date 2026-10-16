import type {
  MetadataCrawler,
  MetadataCrawlerAssignableService,
  MetadataCrawlerListPage,
  MetadataCrawlerLog,
  MetadataCrawlerRun,
} from '@/src/entities/models/metadata-crawler';

export type MetadataCrawlerViewModel = MetadataCrawler;
export type MetadataCrawlerRunViewModel = MetadataCrawlerRun;

export function presentMetadataCrawler(crawler: MetadataCrawler): MetadataCrawlerViewModel {
  return {
    ...crawler,
    databaseService: { ...crawler.databaseService },
    discoveryConfig: { ...crawler.discoveryConfig },
    ...(crawler.lastRun ? { lastRun: presentMetadataCrawlerRun(crawler.lastRun) } : {}),
  };
}

export function presentMetadataCrawlerPage(page: MetadataCrawlerListPage) {
  return { ...page, items: page.items.map(presentMetadataCrawler) };
}

export function presentMetadataCrawlerRun(run: MetadataCrawlerRun): MetadataCrawlerRunViewModel {
  return {
    ...run,
    counters: { ...run.counters },
    ...(run.failure ? { failure: { ...run.failure } } : {}),
  };
}

export function presentAssignableMetadataServices(
  services: readonly MetadataCrawlerAssignableService[],
): readonly MetadataCrawlerAssignableService[] {
  return services.map((service) => ({ ...service, capabilities: { ...service.capabilities } }));
}

export function presentMetadataCrawlerLog(log: MetadataCrawlerLog): MetadataCrawlerLog {
  return { ...log };
}

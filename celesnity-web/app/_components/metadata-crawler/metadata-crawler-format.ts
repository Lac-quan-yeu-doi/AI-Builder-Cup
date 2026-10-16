import type { Translator } from '@/app/_i18n/translate';
import type {
  MetadataCrawlerSchedule,
  MetadataCrawlerSnapshotSummary,
} from '@/src/entities/models/metadata-crawler';

export function formatMetadataCrawlerTime(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

export function formatMetadataCrawlerSchedule(
  schedule: MetadataCrawlerSchedule,
  t: Translator,
): string {
  return schedule.cadence === 'DAILY'
    ? t('metadataCrawler.dailySchedule', { time: schedule.timeOfDay })
    : schedule.expression;
}

export function formatMetadataCrawlerCounters(
  run:
    | {
        readonly counters: {
          readonly relationCount: number;
          readonly columnCount: number;
          readonly deletedCount: number;
        };
      }
    | undefined,
  t: Translator,
): string {
  if (!run) return '—';
  return `${run.counters.relationCount} ${t('metadataCrawler.relations').toLocaleLowerCase()} · ${run.counters.columnCount} ${t('metadataCrawler.columns')} · ${run.counters.deletedCount} ${t('metadataCrawler.deleted')}`;
}

export function formatMetadataCrawlerSnapshot(
  summary: MetadataCrawlerSnapshotSummary,
  t: Translator,
): string {
  if (!summary.hasSnapshot) return t('metadataCrawler.noSnapshot');
  return `${summary.relationCount} ${t('metadataCrawler.relations').toLocaleLowerCase()} · ${summary.columnCount} ${t('metadataCrawler.columns')}`;
}

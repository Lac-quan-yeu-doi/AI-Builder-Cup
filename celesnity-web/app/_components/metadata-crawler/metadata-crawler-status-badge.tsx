import { Badge } from '@/app/_components/ui/badge';
import type {
  MetadataCrawlerRunStatus,
  MetadataCrawlerState,
} from '@/src/entities/models/metadata-crawler';
import type { Translator } from '@/app/_i18n/translate';

export function MetadataCrawlerStatusBadge({
  status,
  t,
}: {
  readonly status: MetadataCrawlerState | MetadataCrawlerRunStatus;
  readonly t: Translator;
}) {
  const tone =
    status === 'ACTIVE' || status === 'SUCCEEDED'
      ? 'success'
      : status === 'RUNNING'
        ? 'info'
        : status === 'PARTIAL' || status === 'QUEUED' || status === 'PAUSED'
          ? 'warning'
          : 'danger';
  const key = `metadataCrawler.${status.toLowerCase()}` as Parameters<Translator>[0];
  return (
    <Badge variant={tone}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {t(key)}
    </Badge>
  );
}

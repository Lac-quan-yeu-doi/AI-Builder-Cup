'use client';

import {
  ChevronRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlugZapIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';

import type { DatabaseServiceViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import type { MetadataCrawler } from '@/src/entities/models/metadata-crawler';
import { Badge } from '@/app/_components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { IconButton } from '@/app/_components/ui/icon-button';
import { Item, ItemContent, ItemTitle } from '@/app/_components/ui/item';
import { sourceTabHref } from '@/app/_components/layout/source-tab-href';
import { useTranslation } from '@/app/_i18n/use-translation';

import { formatTimestamp } from './verification-result';

interface DatabaseServiceListProps {
  readonly databaseServices: readonly DatabaseServiceViewModel[];
  readonly savedTestResults: Readonly<
    Record<
      string,
      import('@/src/interface-adapters/presenters/database-service.presenter').DatabaseServiceVerificationViewModel
    >
  >;
  readonly testingIds: ReadonlySet<string>;
  /** Scans keyed by the source they are assigned to; empty while loading. */
  readonly crawlersByServiceId: Readonly<Record<string, MetadataCrawler>>;
  readonly connectorLabels: Readonly<Record<string, string>>;
  /** Present when the list sits inside a database, which is where a source opens from. */
  readonly databaseName?: string;
  readonly tutorialServiceId?: string;
  readonly onEdit: (id: string) => void;
  readonly onTest: (id: string) => void;
  readonly onArchive: (service: DatabaseServiceViewModel) => void;
  readonly onDetach: (service: DatabaseServiceViewModel) => void;
}

/**
 * One row per connection.
 *
 * Each was a panel of five stacked bands: a dump of every config value, a
 * four-metric strip, the scan state, a full-width verification banner, then
 * three buttons. Two of those four metrics — `CONFIG SCHEMA` and `FIELDS` —
 * were internal detail typeset exactly like `LAST TESTED`, and ten connections
 * meant ten screens of scrolling.
 *
 * What is left is what tells one connection from another: whether it works,
 * what it is, where it points, and when that was last true. The full config
 * already renders properly on the source's own Connection tab.
 */
export function DatabaseServiceList({
  databaseServices,
  savedTestResults,
  testingIds,
  crawlersByServiceId,
  connectorLabels,
  databaseName,
  tutorialServiceId,
  onEdit,
  onTest,
  onArchive,
  onDetach,
}: DatabaseServiceListProps) {
  const { t } = useTranslation();

  return (
    <div
      className="divide-y divide-border"
      role="list"
      aria-label={t('databaseServices.listLabel')}
    >
      {databaseServices.map((service) => {
        const persisted =
          service.verification.status === 'untested' || !service.verification.testedAt
            ? undefined
            : {
                status: service.verification.status,
                testedAt: service.verification.testedAt,
                ...(service.verification.message ? { message: service.verification.message } : {}),
              };
        const result = savedTestResults[service.id] ?? persisted;
        const testing = testingIds.has(service.id);
        const crawler = crawlersByServiceId[service.id];
        const databaseCount = (service.databaseNames ?? []).length;
        const host = service.summary.find((entry) => entry.key === 'host')?.value;
        const href =
          databaseName === undefined
            ? undefined
            : sourceTabHref(databaseName, service.id, 'connection');

        return (
          <Item className="flex-nowrap gap-3" key={service.id} role="listitem" size="sm">
            <ItemContent className="min-w-0 gap-1">
              <ItemTitle className="gap-2">
                {href === undefined ? (
                  <span className="truncate">{service.name}</span>
                ) : (
                  <Link
                    className="truncate hover:text-primary"
                    data-tutorial-target={
                      tutorialServiceId === undefined || tutorialServiceId === service.id
                        ? 'tutorial-database-source'
                        : undefined
                    }
                    href={href}
                  >
                    {service.name}
                  </Link>
                )}
                {/* Only failure earns a badge. A working connection says so in
                 * the line below, where it costs nothing to read past. */}
                {result?.status === 'failed' ? (
                  <Badge variant="danger">{t('databaseServices.failed')}</Badge>
                ) : null}
              </ItemTitle>
              <span className="block truncate text-caption text-muted-foreground">
                {[
                  connectorLabels[service.connectorType] ?? service.connectorType,
                  host,
                  result === undefined
                    ? t('databaseServices.untested')
                    : t(
                        result.status === 'failed'
                          ? 'databaseServices.failedAt'
                          : 'databaseServices.verifiedAt',
                        { when: formatTimestamp(result.testedAt) },
                      ),
                  crawler === undefined
                    ? undefined
                    : t('source.scan.relations', {
                        count: crawler.snapshotSummary.relationCount,
                      }),
                  databaseCount > 1
                    ? t('databaseServices.sharedWith', { count: databaseCount })
                    : undefined,
                ]
                  .filter((part) => part !== undefined && part !== '')
                  .join(' · ')}
              </span>
            </ItemContent>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  disabled={testing}
                  label={t('databaseServices.more', { name: service.name })}
                  size="sm"
                >
                  <MoreHorizontalIcon />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem disabled={testing} onSelect={() => onTest(service.id)}>
                  <PlugZapIcon />
                  {testing ? t('databaseServices.testing') : t('databaseServices.test')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit(service.id)}>
                  <PencilIcon />
                  {t('databaseServices.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {databaseName === undefined ? (
                  <DropdownMenuItem onSelect={() => onArchive(service)} variant="destructive">
                    <Trash2Icon />
                    {t('databaseServices.archive')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => onDetach(service)} variant="destructive">
                    <Trash2Icon />
                    {t('databaseServices.remove')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {href === undefined ? null : (
              <ChevronRightIcon
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
                size={17}
              />
            )}
          </Item>
        );
      })}
    </div>
  );
}

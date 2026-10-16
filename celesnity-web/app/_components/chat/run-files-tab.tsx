'use client';

import { useMemo, useState } from 'react';

import type { Translator } from '@/app/_i18n/translate';
import { Badge, type BadgeVariant } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { cn } from '@/app/_components/ui/utils';
import type { RunFileEntry } from '@/src/entities/models/chat';

import type { TabState } from './tab-state';

type AccessType = RunFileEntry['accessType'];
type FileFilter = 'all' | AccessType;

const FILTERS: readonly FileFilter[] = ['all', 'created', 'modified', 'read'];

/**
 * Access type → Badge tone. The palette defines one status colour
 * (`destructive`); `success`/`warning`/`info` borrow Tailwind's own scales
 * through the Badge variants, so no class strings are hand-written here.
 * `created` is a new artefact (success), `modified` a change (warning), and
 * `read` an untouched input (neutral info).
 */
const ACCESS_BADGE: Readonly<Record<AccessType, BadgeVariant>> = {
  created: 'success',
  modified: 'warning',
  read: 'info',
};

/** Human-readable byte size, e.g. `5 B`, `1.2 KB`, `3.4 MB`. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export interface RunFilesTabProps {
  readonly state: TabState<readonly RunFileEntry[]>;
  // Carries the whole entry (not just the path) so the file viewer can apply
  // the 2 MB inline cap from `sizeBytes` BEFORE fetching — an over-cap file is
  // never pulled into the browser just to be rejected. See C5's RunFileViewer.
  readonly onSelectFile: (entry: RunFileEntry) => void;
  readonly t: Translator;
}

/**
 * Lists a run's provenance files as a flat, path-sorted list (a tree was
 * deemed disproportionate for C4 — see the task report). Mirrors `TabPanel`'s
 * per-status rendering, then adds an access-type filter and the list itself.
 * Selecting an available file calls `onSelectFile`; unavailable files render
 * as an inert note. The file-content detail view is C5's concern.
 */
export function RunFilesTab({ state, onSelectFile, t }: RunFilesTabProps) {
  const [filter, setFilter] = useState<FileFilter>('all');

  const entries = state.status === 'loaded' ? state.data : null;
  const visible = useMemo(() => {
    if (!entries) return [];
    const filtered = filter === 'all' ? entries : entries.filter((e) => e.accessType === filter);
    return [...filtered].sort((a, b) => a.path.localeCompare(b.path));
  }, [entries, filter]);

  if (state.status === 'idle' || state.status === 'loading') {
    return <p className="text-xs text-muted-foreground">{t('chat.runInspector.loading')}</p>;
  }
  if (state.status === 'not-found') {
    return <p className="text-xs text-muted-foreground">{t('chat.runInspector.notFound')}</p>;
  }
  if (state.status === 'error') {
    return <p className="text-xs text-destructive">{state.message}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t('chat.runInspector.tab.files')}
      >
        {FILTERS.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={filter === option ? 'default' : 'outline'}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {t(`chat.runInspector.files.filter.${option}`)}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('chat.runInspector.files.empty')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {visible.map((entry) => (
            <li key={entry.path}>
              <FileRow entry={entry} onSelectFile={onSelectFile} t={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  entry,
  onSelectFile,
  t,
}: {
  readonly entry: RunFileEntry;
  readonly onSelectFile: (entry: RunFileEntry) => void;
  readonly t: Translator;
}) {
  const meta = (
    <>
      <Badge variant={ACCESS_BADGE[entry.accessType]}>
        {t(`chat.runInspector.files.access.${entry.accessType}`)}
      </Badge>
      {entry.sizeBytes !== undefined && (
        <span className="text-micro text-muted-foreground">{formatBytes(entry.sizeBytes)}</span>
      )}
      <span className="text-micro text-muted-foreground">{entry.accessedAt}</span>
    </>
  );

  if (!entry.available) {
    return (
      <div className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs opacity-60">
        <span className="flex-1 truncate font-mono text-muted-foreground">{entry.path}</span>
        {meta}
        <span className="text-micro text-muted-foreground italic">
          {t('chat.runInspector.files.unavailable')}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelectFile(entry)}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted',
      )}
    >
      <span className="flex-1 truncate font-mono">{entry.path}</span>
      {meta}
    </button>
  );
}

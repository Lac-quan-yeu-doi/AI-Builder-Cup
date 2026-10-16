'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, ChevronDownIcon, DatabaseIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import { getInjection } from '@/di/container';

interface ChatDatabasePickerProps {
  readonly disabled?: boolean;
  /** Injected by the isolated tutorial sandbox; undefined keeps the live Core lookup. */
  readonly databases?: readonly string[];
  /** `null` is every database, which is what an unscoped conversation asks. */
  readonly onChange: (database: string | null) => void;
  readonly value: string | null;
}

/**
 * Which database this conversation is about.
 *
 * The assistant reads the whole Iceberg catalog, so "how many orders last
 * month" is ambiguous the moment a workspace holds more than one database —
 * and nothing on the screen let anyone say which one they meant. Picking one
 * is not a hint: the run carries it, and the data tools refuse a table outside
 * it, so the answer cannot quietly come from somewhere else.
 *
 * Scoped per conversation rather than per message: a chat is about a subject,
 * and re-choosing on every question would be a tax on the common case.
 */
export function ChatDatabasePicker({
  databases: providedDatabases,
  disabled,
  onChange,
  value,
}: ChatDatabasePickerProps) {
  const { t } = useTranslation();
  const [loadedDatabases, setDatabases] = useState<readonly string[]>();
  const databases = providedDatabases ?? loadedDatabases;

  useEffect(() => {
    if (providedDatabases !== undefined) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      const catalogs = await getInjection('ListCatalogsController')();
      const catalog = catalogs[0];
      if (catalog === undefined) return;
      const namespaces = await getInjection('ListNamespacesController')(catalog.name);
      if (!cancelled) setDatabases(namespaces.map((namespace) => namespace.name));
    };
    // A picker that cannot list is just disabled; it is not a reason to break
    // the composer it sits in.
    load().catch(() => {
      if (!cancelled) setDatabases([]);
    });
    return () => {
      cancelled = true;
    };
  }, [providedDatabases]);

  const label = value ?? t('chat.database.all');

  return (
    <DropdownMenu>
      {/* A scope, not a filename. It used to be bare monospace text floating
          above the input with nothing to say it could be pressed; the whole
          point of the control is that this conversation is bounded, so the
          chip looks like a chip and the bound reads in words. */}
      <DropdownMenuTrigger
        data-tutorial-target="chat-database-picker"
        aria-label={t('chat.database.label', { database: label })}
        className={cn(
          'group/scope flex h-7 max-w-[15rem] shrink-0 items-center gap-1.5 rounded-full border px-2.5',
          'text-caption transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          value === null
            ? 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            : 'border-primary/25 bg-accent text-foreground',
        )}
        disabled={disabled === true || databases === undefined}
        title={t('chat.database.label', { database: label })}
        type="button"
      >
        <DatabaseIcon aria-hidden="true" className="shrink-0 opacity-70" size={15} />
        <span className="truncate font-medium">{label}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="-me-0.5 shrink-0 opacity-50 transition-opacity group-hover/scope:opacity-90"
          size={15}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[220px]" side="top">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <CheckIcon className={cn(value !== null && 'invisible')} size={17} />
          <span className="grid gap-0.5">
            <span>{t('chat.database.all')}</span>
            <span className="text-caption text-muted-foreground">{t('chat.database.allHint')}</span>
          </span>
        </DropdownMenuItem>

        {databases !== undefined && databases.length > 0 ? <DropdownMenuSeparator /> : null}

        {databases?.map((database) => (
          <DropdownMenuItem key={database} onSelect={() => onChange(database)}>
            <CheckIcon className={cn(value !== database && 'invisible')} size={17} />
            <span className="font-medium">{database}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

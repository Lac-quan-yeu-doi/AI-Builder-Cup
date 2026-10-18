'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  ChevronsUpDownIcon,
  FactoryIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  NetworkIcon,
  SettingsIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { cn } from '@/app/_components/ui/utils';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import { getInjection } from '@/di/container';

import { RAIL_CURRENT, RAIL_IDLE } from './rail-styles';
import type { PlantSiteSummary } from '@/src/entities/models/plant-model';

/*
 * Inside a plant the rail stops listing the whole workspace and becomes the
 * plant's own navigation: a way back, a switcher, and the plant's pages. The
 * plant header used to carry these as a tab strip; moving them here gives
 * every plant page the full width and one place to look for "where am I".
 */

const plantModel = getInjection('PlantModelController');

/** `/plant-model/<siteId>/...` → the site id, except for the walkthrough screen. */
export function plantSiteFromPath(pathname: string): string | undefined {
  const match = /^\/plant-model\/([^/]+)/u.exec(pathname);
  if (match?.[1] === undefined || match[1] === 'walkthrough') return undefined;
  return decodeURIComponent(match[1]);
}

interface PlantPage {
  readonly segment: string;
  readonly labelKey: TranslationKey;
  readonly icon: LucideIcon;
}

const PLANT_GROUPS: readonly {
  readonly labelKey: TranslationKey;
  readonly pages: readonly PlantPage[];
}[] = [
  {
    labelKey: 'plantRail.group.plant',
    pages: [
      { segment: 'overview', labelKey: 'plantRail.overview', icon: LayoutGridIcon },
      { segment: 'model', labelKey: 'plantRail.model', icon: NetworkIcon },
      { segment: 'dashboards', labelKey: 'plantRail.dashboards', icon: LayoutDashboardIcon },
    ],
  },
  {
    labelKey: 'plantRail.group.operations',
    pages: [
      { segment: 'repairs', labelKey: 'plantRail.repairs', icon: WrenchIcon },
      { segment: 'configure', labelKey: 'plantRail.configure', icon: SettingsIcon },
    ],
  },
];

export function PlantRail({
  siteId,
  collapsed,
  onNavigate,
}: {
  readonly siteId: string;
  readonly collapsed: boolean;
  readonly onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<readonly PlantSiteSummary[]>([]);
  const base = `/plant-model/${encodeURIComponent(siteId)}`;
  const current = sites.find((site) => site.id === siteId);
  const page = pathname.slice(base.length).split('/')[1] ?? 'overview';
  const assistantOpen = searchParams.get('assistant') === '1';

  useEffect(() => {
    let active = true;
    void plantModel.listSites().then(
      (value) => {
        if (active) setSites(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [siteId]);

  const toggleAssistant = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (assistantOpen) params.delete('assistant');
    else params.set('assistant', '1');
    const query = params.toString();
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    onNavigate();
  };

  const item = (href: string, label: string, Icon: LucideIcon, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      onClick={onNavigate}
      className={cn(
        'relative flex min-h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-body-sm focus-visible:outline-none',
        active ? RAIL_CURRENT : RAIL_IDLE,
        collapsed && 'md:justify-center md:px-0',
      )}
    >
      <Icon
        className={cn('shrink-0', active ? 'text-foreground' : 'text-muted-foreground')}
        size={19}
      />
      <span className={cn('truncate', collapsed && 'md:hidden')}>{label}</span>
    </Link>
  );

  return (
    <div className="grid gap-0.5">
      {item('/plant-model', t('plantRail.allPlants'), ArrowLeftIcon, false)}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('plantRail.switch')}
            title={current?.name ?? t('plantRail.switch')}
            className={cn(
              'mt-2 mb-1 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-background px-2.5 py-2 text-left hover:bg-sidebar-accent',
              collapsed && 'md:justify-center md:border-0 md:bg-transparent md:px-0',
            )}
          >
            <FactoryIcon className="shrink-0 text-muted-foreground" size={19} />
            <span className={cn('grid min-w-0 flex-1', collapsed && 'md:hidden')}>
              <span className="truncate text-body-sm font-[650] text-foreground">
                {current?.name ?? '…'}
              </span>
              <span className="truncate font-mono text-micro text-muted-foreground tabular-nums">
                {current === undefined ? ' ' : `${current.code} · r${current.revision}`}
              </span>
            </span>
            <ChevronsUpDownIcon
              className={cn('shrink-0 text-muted-foreground', collapsed && 'md:hidden')}
              size={16}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {sites.map((site) => (
            <DropdownMenuItem
              key={site.id}
              onSelect={() => {
                router.push(`/plant-model/${encodeURIComponent(site.id)}/${page}`);
                onNavigate();
              }}
              className="flex flex-col items-start gap-0"
            >
              <span className="text-body-sm">{site.name}</span>
              <span className="font-mono text-micro text-muted-foreground">{site.code}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {PLANT_GROUPS.map((group) => (
        <div key={group.labelKey} className="grid gap-0.5">
          <span
            className={cn(
              'px-2.5 pt-4 pb-1 font-mono text-micro tracking-[0.12em] text-muted-foreground/70 uppercase',
              collapsed && 'md:hidden',
            )}
          >
            {t(group.labelKey)}
          </span>
          {group.pages.map((plantPage) =>
            item(
              `${base}/${plantPage.segment}`,
              t(plantPage.labelKey),
              plantPage.icon,
              page === plantPage.segment,
            ),
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={toggleAssistant}
        aria-pressed={assistantOpen}
        title={t('plantRail.ask')}
        className={cn(
          'relative mt-4 flex min-h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-body-sm',
          assistantOpen ? RAIL_CURRENT : RAIL_IDLE,
          collapsed && 'md:justify-center md:px-0',
        )}
      >
        <MessageSquareIcon className="shrink-0" size={19} />
        <span className={cn('truncate', collapsed && 'md:hidden')}>{t('plantRail.ask')}</span>
      </button>
    </div>
  );
}

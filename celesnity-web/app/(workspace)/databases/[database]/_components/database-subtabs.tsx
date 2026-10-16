'use client';

import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import { TabsList, TabsTrigger } from '@/app/_components/ui/tabs';

/**
 * The database's tab strip.
 *
 * This replaced a flow rail — four bordered tiles reading
 * `sources → pipelines → tables`, with Runs past a divider. The arrows were a
 * teaching device paying rent on every visit: the default tab is `tables`, so
 * the canonical URL opened in the middle of the story; Runs already needed an
 * exception; and the order the arrows claimed is not true, since a table can
 * arrive from a crawler with no pipeline involved. `DatabaseNextStep` teaches
 * the same thing in words, only when there is something to do.
 *
 * Counts stay because they answer "is there anything in there"; the captions
 * that carried the flow ("Waiting on the step before") went with the arrows.
 *
 * The `default` variant, not `line`: it is what `TabsList` ships as canonical
 * and what the design system's own showcase uses, and the skin it comes from
 * says selection with a filled surface rather than a rule — near-black CTA,
 * `bg-muted` wells, tinted hover. The underline variant had to be overridden
 * to sit anywhere useful (`after:hidden` plus a hand-drawn bottom border), and
 * it added a full-width rule to a screen that already had too many.
 */
interface DatabaseSubtabsProps {
  readonly counts: {
    readonly tables: number;
    readonly sources: number;
    readonly pipelines: number;
    readonly runs: number;
  };
}

const TABS: readonly { readonly value: string; readonly labelKey: TranslationKey }[] = [
  { value: 'overview', labelKey: 'database.tab.overview' },
  { value: 'tables', labelKey: 'database.tab.tables' },
  { value: 'sources', labelKey: 'database.tab.sources' },
  { value: 'pipelines', labelKey: 'database.tab.pipelines' },
  { value: 'runs', labelKey: 'database.tab.runs' },
];

export function DatabaseSubtabs({ counts }: DatabaseSubtabsProps) {
  const { t } = useTranslation();

  return (
    <TabsList
      aria-label={t('database.tabs')}
      // `max-w-full` + `min-w-0` so the segmented control scrolls on a phone
      // rather than widening the column past the viewport.
      className="max-w-full min-w-0 justify-start overflow-x-auto"
    >
      {TABS.map((tab) => {
        const count = counts[tab.value as keyof DatabaseSubtabsProps['counts']];
        return (
          <TabsTrigger
            className="flex-none gap-1.5 px-3"
            data-tutorial-target={tab.value === 'sources' ? 'database-sources-tab' : undefined}
            key={tab.value}
            value={tab.value}
          >
            {t(tab.labelKey)}
            {count === undefined ? null : (
              <span className="text-caption tabular-nums opacity-60">{count}</span>
            )}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

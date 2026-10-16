'use client';

import type { Translator } from '@/app/_i18n/translate';

import type { Artifact } from './chat-stage.types';
import { ChartSidebar, type ChartSidebarProps } from '../chart-sidebar';

/**
 * `ChartSidebar` is itself a whole charts browser — list, create, edit, and
 * drill into any one chart's detail via `focusChartRequest` — not a
 * per-chart view. So this is a singleton artifact, like `table`/`automation`/
 * `document`, not one artifact per chart. Opening a *specific* chart (e.g.
 * from a citation click) is `focusChartRequest`'s job, unchanged — dispatch
 * this artifact's `open` alongside it so the pane exists to focus into.
 */
export function chartsArtifact(t: Translator): Artifact {
  return {
    id: 'chart:list',
    kind: 'chart',
    title: t('chat.pane.title.charts'),
    meta: t('chat.pane.kind.chart'),
  };
}

/**
 * Mounts the existing `ChartSidebar` as pane content. `ChartSidebar` itself
 * carries no width/border/background — it previously relied on a fixed
 * `<aside>` wrapper in `chat-screen.tsx` for that (see the comment above its
 * own `return`); the Stage pane chrome (`chat-stage-shell.tsx`) provides an
 * equivalent flex/height context now, so only that context needs replicating
 * here.
 */
export function ChartPane(props: ChartSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartSidebar {...props} />
    </div>
  );
}

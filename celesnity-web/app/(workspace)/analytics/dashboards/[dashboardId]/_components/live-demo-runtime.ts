'use client';

import { useEffect, useMemo, useState } from 'react';

import type { DashboardChartRuntimeResult } from '@/src/entities/models/dashboard-runtime';
import { liveDemoResult } from './live-demo-jitter';
import type { DashboardRuntimeState } from './dashboard-runtime-state';

/** How often the board moves. Cards drift on their own phases inside this. */
const TICK_MS = 1_000;

/**
 * Drifts a dashboard's numbers so a recorded walkthrough looks live.
 *
 * Demo-only — see `live-demo-jitter.ts`. It leaves the reducer's state alone and
 * derives a display copy, so the executed values stay intact underneath: a
 * filter change, a retry, or opening the same dashboard on its own page all show
 * exactly what Core returned.
 *
 * The clock restarts whenever the underlying runtime changes, so each fresh
 * query result is the new baseline rather than something the drift compounds on.
 */
export function useLiveDemoRuntime(
  runtime: DashboardRuntimeState,
  { enabled }: { readonly enabled: boolean },
): DashboardRuntimeState {
  const [clock, setClock] = useState({ elapsed: 0, nowMs: 0 });
  const [baseline, setBaseline] = useState(runtime);

  /*
   * Rebase during render rather than in an effect: the drift must start from the
   * numbers Core just returned, and waiting for an effect would paint one frame
   * of the previous query's drift on top of the new values.
   */
  if (baseline !== runtime) {
    setBaseline(runtime);
    setClock({ elapsed: 0, nowMs: 0 });
  }

  useEffect(() => {
    if (!enabled) return;
    /*
     * Motion this constant is what `prefers-reduced-motion` exists for, and a
     * tab nobody is looking at has no reason to hold a timer awake.
     */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const startedAt = Date.now();
    let hiddenSince: number | undefined;
    let hiddenFor = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        hiddenSince ??= Date.now();
        return;
      }
      if (hiddenSince !== undefined) {
        hiddenFor += Date.now() - hiddenSince;
        hiddenSince = undefined;
      }
      /*
       * The wall clock travels with the drift. A trend whose values move while
       * its time axis stays put reads as broken, so the axis is rewritten from
       * this timestamp — see `liveDemoTrend`.
       */
      const at = Date.now();
      setClock({ elapsed: (at - startedAt - hiddenFor) / 1_000, nowMs: at });
    }, TICK_MS);
    return () => window.clearInterval(timer);
    /* `runtime` restarts the clock whenever a fresh result arrives. */
  }, [enabled, runtime]);

  return useMemo(() => {
    if (!enabled || clock.elapsed === 0) return runtime;
    return {
      cards: Object.fromEntries(
        Object.entries(runtime.cards).map(([cardId, card]) => {
          if (card.status !== 'SUCCESS' || card.result === undefined) return [cardId, card];
          const result = card.result as DashboardChartRuntimeResult;
          return [
            cardId,
            { ...card, result: liveDemoResult(result, cardId, clock.elapsed, clock.nowMs) },
          ];
        }),
      ),
    };
  }, [clock, enabled, runtime]);
}

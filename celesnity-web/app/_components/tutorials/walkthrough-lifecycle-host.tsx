'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useDestinationReady } from '@/app/_components/tutorials/use-destination-ready';
import { Button } from '@/app/_components/ui/button';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  ResumeTutorialRunViewModel,
  StartTutorialRunViewModel,
} from '@/src/interface-adapters/presenters/tutorial-run.presenter';

type StartConflictResolution = 'PAUSE_ACTIVE' | 'CANCEL_NEW_START';

export type WalkthroughLifecycleLaunch =
  | {
      readonly kind: 'start';
      readonly execute: (
        conflictResolution?: StartConflictResolution,
      ) => Promise<StartTutorialRunViewModel>;
    }
  | {
      readonly kind: 'resume';
      readonly execute: (
        destinationReady: boolean,
        conflictResolution?: StartConflictResolution,
      ) => Promise<ResumeTutorialRunViewModel>;
    };

/**
 * Every resolved launch attempt, reported verbatim so the owning host can react
 * to the outcomes this component does not render itself — a cancelled start, a
 * failed pause of the active run, or the started run it must now display.
 */
export type WalkthroughLaunchReport =
  | { readonly kind: 'start'; readonly result: StartTutorialRunViewModel }
  | { readonly kind: 'resume'; readonly result: ResumeTutorialRunViewModel }
  | { readonly kind: 'failed' };

export interface WalkthroughLifecycleHostProps {
  readonly launch: WalkthroughLifecycleLaunch;
  readonly navigate: (destinationHref: string) => void;
  readonly readySelector?: string | null;
  readonly requiredControlSelector?: string | null;
  readonly onLaunchResult?: (report: WalkthroughLaunchReport) => void;
  /** Shown while the run is being requested or the destination is not ready. */
  readonly pending?: ReactNode;
  readonly children?: ReactNode;
}

type LifecycleState =
  | { readonly kind: 'launching' }
  | { readonly kind: 'conflict' }
  | {
      readonly kind: 'waiting-for-destination';
      readonly destinationHref: string;
      readonly launchKind: WalkthroughLifecycleLaunch['kind'];
    }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'inactive' }
  | { readonly kind: 'ready' };

function resumeCanAwaitDestination(
  result: ResumeTutorialRunViewModel,
): result is Extract<ResumeTutorialRunViewModel, { readonly outcome: 'BLOCKED' }> {
  return (
    result.outcome === 'BLOCKED' &&
    result.blockers.destinationNotReady &&
    result.blockers.blockingFeatureIds.length === 0 &&
    result.blockers.unsatisfiedPrerequisiteIds.length === 0 &&
    result.blockers.replacementRequiredRequirementIds.length === 0
  );
}

/**
 * Coordinates the browser-owned portion of starting and resuming a walkthrough.
 * The lifecycle controllers retain all business rules; this host only navigates,
 * waits for the destination DOM to become interactive, and then reveals its
 * walkthrough children. A paused run is submitted as ready only after that gate.
 */
export function WalkthroughLifecycleHost({
  launch,
  navigate,
  readySelector,
  requiredControlSelector,
  onLaunchResult,
  pending,
  children,
}: WalkthroughLifecycleHostProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LifecycleState>({ kind: 'launching' });
  // Held in a ref so a caller's inline reporter cannot re-trigger the launch.
  const reportRef = useRef(onLaunchResult);
  useEffect(() => {
    reportRef.current = onLaunchResult;
  }, [onLaunchResult]);
  const destinationHref = state.kind === 'waiting-for-destination' ? state.destinationHref : null;
  const destinationReady = useDestinationReady({
    destinationHref,
    enabled: state.kind === 'waiting-for-destination',
    readySelector,
    requiredControlSelector,
  });

  useEffect(() => {
    let active = true;

    const launchWalkthrough = async () => {
      if (launch.kind === 'start') {
        const result = await launch.execute();
        if (!active) return;
        reportRef.current?.({ kind: 'start', result });

        if (result.outcome === 'STARTED') {
          navigate(result.destinationHref);
          setState({
            kind: 'waiting-for-destination',
            destinationHref: result.destinationHref,
            launchKind: 'start',
          });
        } else if (result.outcome === 'CONFLICT_REQUIRES_CHOICE') {
          setState({ kind: 'conflict' });
        } else {
          setState({ kind: 'inactive' });
        }
        return;
      }

      const result = await launch.execute(false);
      if (!active) return;
      reportRef.current?.({ kind: 'resume', result });

      if (result.outcome === 'RESUMED') {
        setState({ kind: 'ready' });
      } else if (result.outcome === 'CONFLICT_REQUIRES_CHOICE') {
        setState({ kind: 'conflict' });
      } else if (resumeCanAwaitDestination(result)) {
        navigate(result.destinationHref);
        setState({
          kind: 'waiting-for-destination',
          destinationHref: result.destinationHref,
          launchKind: 'resume',
        });
      } else {
        setState({ kind: 'blocked' });
      }
    };

    void launchWalkthrough();
    return () => {
      active = false;
    };
  }, [launch, navigate]);

  useEffect(() => {
    if (state.kind !== 'waiting-for-destination' || !destinationReady) return;

    if (state.launchKind === 'start') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- readiness is the external DOM gate that opens the panel
      setState({ kind: 'ready' });
      return;
    }

    if (launch.kind !== 'resume') return;

    let active = true;
    void launch.execute(true).then(
      (result) => {
        if (!active) return;
        reportRef.current?.({ kind: 'resume', result });
        setState(result.outcome === 'RESUMED' ? { kind: 'ready' } : { kind: 'blocked' });
      },
      () => {
        if (!active) return;
        reportRef.current?.({ kind: 'failed' });
        setState({ kind: 'blocked' });
      },
    );

    return () => {
      active = false;
    };
  }, [destinationReady, launch, state]);

  const resolveConflict = async (resolution: StartConflictResolution) => {
    setState({ kind: 'launching' });
    try {
      if (launch.kind === 'start') {
        const result = await launch.execute(resolution);
        reportRef.current?.({ kind: 'start', result });

        if (result.outcome === 'STARTED') {
          navigate(result.destinationHref);
          setState({
            kind: 'waiting-for-destination',
            destinationHref: result.destinationHref,
            launchKind: 'start',
          });
        } else {
          setState({ kind: 'inactive' });
        }
        return;
      }

      const result = await launch.execute(false, resolution);
      reportRef.current?.({ kind: 'resume', result });
      if (result.outcome === 'RESUMED') {
        setState({ kind: 'ready' });
      } else if (resumeCanAwaitDestination(result)) {
        navigate(result.destinationHref);
        setState({
          kind: 'waiting-for-destination',
          destinationHref: result.destinationHref,
          launchKind: 'resume',
        });
      } else {
        setState({ kind: 'inactive' });
      }
    } catch {
      reportRef.current?.({ kind: 'failed' });
      setState({ kind: 'inactive' });
    }
  };

  if (state.kind === 'conflict') {
    return (
      <PageAlert className="grid gap-4" tone="warning">
        <div className="grid gap-1">
          <h2 className="text-title text-foreground">{t('tutorial.activeRunConflictTitle')}</h2>
          <p>{t('tutorial.activeRunConflictDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void resolveConflict('PAUSE_ACTIVE')}>
            {t(
              launch.kind === 'resume'
                ? 'tutorial.pauseCurrentAndResume'
                : 'tutorial.pauseCurrentAndStart',
            )}
          </Button>
          <Button onClick={() => void resolveConflict('CANCEL_NEW_START')} variant="outline">
            {t('tutorial.cancelNewStart')}
          </Button>
        </div>
      </PageAlert>
    );
  }

  if (state.kind === 'ready') return children;
  if (state.kind === 'launching' || state.kind === 'waiting-for-destination')
    return pending ?? null;
  return null;
}

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, type ReactNode } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Skeleton } from '@/app/_components/ui/skeleton';
import type { TwinScene } from '@/src/entities/models/plant-twin-scene';

import { STATE_DOT, STATE_LABEL } from './twin-labels';

// WebGL needs a browser; the server renders a placeholder of the same size.
const TwinCanvas = dynamic(() => import('./twin-canvas').then((module) => module.TwinCanvas), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

interface TwinStageProps {
  readonly scene: TwinScene;
  readonly selectedId?: string;
  readonly onSelect: (id: string | undefined) => void;
  /** Whether the scene has flows the camera only assumed, so the legend explains dashes. */
  readonly showsAssumedFlows: boolean;
  /** The panel for the selected machine, laid over the stage. */
  readonly children?: ReactNode;
}

/**
 * The 3D floor of a plant: the canvas, a name over every machine and area,
 * and the legend. What a machine panel says is up to the screen using it.
 */
export function TwinStage({
  scene,
  selectedId,
  onSelect,
  showsAssumedFlows,
  children,
}: TwinStageProps) {
  const { t } = useTranslation();
  const labels = useRef(new Map<string, HTMLElement>());
  const label = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element === null) labels.current.delete(id);
      else labels.current.set(id, element);
    },
    [],
  );

  return (
    <div className="relative h-[560px] overflow-hidden rounded-xl border bg-muted/40">
      <TwinCanvas scene={scene} selectedId={selectedId} onSelect={onSelect} labels={labels} />

      {/* Positioned by the canvas every frame; hidden until the first frame places them. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {scene.machines.map((machine) => (
          <span
            key={machine.id}
            ref={label(machine.id)}
            style={{ visibility: 'hidden' }}
            className="absolute top-0 left-0 will-change-transform"
          >
            <span
              className={
                machine.id === selectedId
                  ? 'block max-w-32 -translate-x-1/2 -translate-y-full truncate rounded-md border border-transparent bg-status-info px-1.5 py-0.5 text-micro font-medium whitespace-nowrap text-primary-foreground shadow-sm'
                  : `block max-w-32 -translate-x-1/2 -translate-y-full truncate rounded-md border bg-card px-1.5 py-0.5 text-micro font-medium whitespace-nowrap shadow-sm transition-opacity ${
                      selectedId === undefined ? '' : 'opacity-40'
                    }`
              }
            >
              {machine.name}
            </span>
          </span>
        ))}
        {scene.zones
          .filter((zone) => zone.kind === 'area')
          .map((zone) => (
            <span
              key={zone.id}
              ref={label(zone.id)}
              style={{ visibility: 'hidden' }}
              className="absolute top-0 left-0 will-change-transform"
            >
              <span className="block -translate-x-[calc(100%+10px)] translate-y-1 rounded bg-background/90 px-1.5 py-0.5 text-micro font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                {zone.name}
              </span>
            </span>
          ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg bg-card/90 px-3 py-2 text-micro text-muted-foreground shadow-sm">
        <div className="flex gap-3">
          {(['running', 'idle', 'stopped', 'unknown'] as const).map((state) => (
            <span key={state} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${STATE_DOT[state]}`} aria-hidden />
              {t(STATE_LABEL[state])}
            </span>
          ))}
        </div>
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-foreground/60" aria-hidden />
            {t(showsAssumedFlows ? 'plantWalkthrough.legend.seen' : 'plantTwin.legend.flow')}
          </span>
          {showsAssumedFlows && (
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-5 border-t-2 border-dashed border-foreground/60" aria-hidden />
              {t('plantWalkthrough.legend.assumed')}
            </span>
          )}
        </div>
      </div>
      <p className="pointer-events-none absolute right-3 bottom-3 text-micro text-muted-foreground">
        {t('plantWalkthrough.hint')}
      </p>

      {children}
    </div>
  );
}

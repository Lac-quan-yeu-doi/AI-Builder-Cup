'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import {
  assistantPanelMaxWidth,
  assistantPanelMinWidth,
  assistantPanelWidth,
  useAssistantPanelStore,
} from '@/app/_stores/assistant-panel.store';

const widthStep = 16;

/** The stored width for a surface, rehydrated after mount. */
export function useAssistantSurfaceWidth(surface: string): number {
  const widths = useAssistantPanelStore((state) => state.widths);

  useEffect(() => {
    void useAssistantPanelStore.persist.rehydrate();
  }, []);

  return assistantPanelWidth(widths, surface);
}

/**
 * The drag edge on the left of a right-docked panel.
 *
 * Dragging left widens, which is why the delta is `startX - clientX`. Keyboard
 * users get the same range off the arrow keys, because a separator that only
 * answers a pointer is a control half the workspace cannot reach.
 *
 * Lives on its own so the workflow dock, which brings its own frame and tab
 * strip, resizes by the same rule and against the same stored width.
 */
export function AssistantResizeHandle({ surface }: { readonly surface: string }): ReactElement {
  const { t } = useTranslation();
  const width = useAssistantSurfaceWidth(surface);
  const setWidth = useAssistantPanelStore((state) => state.setWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      setWidth(surface, drag.startWidth + (drag.startX - event.clientX));
    },
    [setWidth, surface],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragging, onPointerMove, onPointerUp]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === 'ArrowLeft'
        ? width + widthStep
        : event.key === 'ArrowRight'
          ? width - widthStep
          : event.key === 'Home'
            ? assistantPanelMinWidth
            : event.key === 'End'
              ? assistantPanelMaxWidth
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setWidth(surface, next);
  };

  return (
    <div
      aria-label={t('assistant.resizeLabel')}
      aria-orientation="vertical"
      aria-valuemax={assistantPanelMaxWidth}
      aria-valuemin={assistantPanelMinWidth}
      aria-valuenow={width}
      className={cn(
        'absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize min-[1080px]:block',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-ring/40 focus-visible:outline-none focus-visible:after:bg-ring',
        dragging ? 'after:bg-ring' : 'after:bg-transparent',
      )}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        dragRef.current = { startX: event.clientX, startWidth: width };
        setDragging(true);
      }}
      role="separator"
      tabIndex={0}
    />
  );
}

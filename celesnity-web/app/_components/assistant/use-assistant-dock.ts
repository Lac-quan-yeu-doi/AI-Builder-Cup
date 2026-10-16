'use client';

import { useEffect, useState } from 'react';

import { getInjection } from '@/di/container';
import { assistantPanelOpen, useAssistantPanelStore } from '@/app/_stores/assistant-panel.store';

import type { AssistantChatControllers } from './assistant-panel';

interface AssistantDock {
  readonly open: boolean;
  readonly show: () => void;
  readonly hide: () => void;
  readonly toggle: () => void;
}

/**
 * Whether the viewport is wide enough to dock a panel beside the screen.
 *
 * False on the server and on the first client render, so the markup matches and
 * a phone never boots with a full-screen sheet over the page it asked for.
 */
export function useDockedViewport(): boolean {
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1080px)');
    const sync = () => setDocked(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return docked;
}

/**
 * Whether the assistant is showing on this surface, and the one shortcut that
 * changes it.
 *
 * Lives in the host rather than in the panel because a closed panel is not
 * mounted, and something still has to answer the keystroke that reopens it.
 * Cmd+J everywhere, next to the Cmd+B the rail already owns.
 */
export function useAssistantDock(surface: string, defaultOpen: boolean): AssistantDock {
  const overrides = useAssistantPanelStore((state) => state.openOverrides);
  const setOpen = useAssistantPanelStore((state) => state.setOpen);
  const docked = useDockedViewport();
  // A surface that opens with the screen only does so where there is room for
  // it. Below the dock breakpoint the panel is a sheet, and a sheet nobody
  // asked for is a page you cannot read.
  const open = assistantPanelOpen(overrides, surface, defaultOpen && docked);

  useEffect(() => {
    void useAssistantPanelStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setOpen(surface, !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen, surface]);

  return {
    open,
    show: () => setOpen(surface, true),
    hide: () => setOpen(surface, false),
    toggle: () => setOpen(surface, !open),
  };
}

/**
 * The transcript controllers, resolved once per panel.
 *
 * Every copy of the old panels resolved these four at module scope, and two of
 * them then passed `() => undefined` for citations, so a citation in a docked
 * transcript silently did nothing.
 */
export function useAssistantControllers(): AssistantChatControllers {
  const [controllers] = useState<AssistantChatControllers>(() => ({
    resolveCitations: getInjection('ResolveCitationsController'),
    listPendingActions: getInjection('ListPendingActionsController'),
    approvePendingAction: getInjection('ApprovePendingActionController'),
    rejectPendingAction: getInjection('RejectPendingActionController'),
  }));
  return controllers;
}

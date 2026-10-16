'use client';

import { create } from 'zustand';

import type { TutorialStatus } from '@/src/entities/models/tutorial-progress';
import type { TutorialExperience } from '@/src/entities/models/tutorial-definition';

export type TutorialSurface = 'none' | 'catalog' | 'detail' | 'onboarding' | 'walkthrough';

export interface TutorialCatalogViewState {
  readonly search: string;
  readonly filters: readonly TutorialStatus[];
  readonly scrollTop: number;
}

interface TutorialSessionState {
  readonly openSurface: TutorialSurface;
  readonly activeRunId: string | null;
  readonly activeTutorialId: string | null;
  readonly activeStepId: string | null;
  readonly activeExperience: TutorialExperience | null;
  readonly catalogView: TutorialCatalogViewState;
  readonly setOpenSurface: (surface: TutorialSurface) => void;
  readonly setActiveRunId: (runId: string | null) => void;
  readonly setActiveExperience: (experience: TutorialExperience | null) => void;
  readonly setActiveTutorial: (
    input: {
      readonly tutorialId: string;
      readonly stepId: string;
      readonly experience: TutorialExperience;
    } | null,
  ) => void;
  readonly setCatalogView: (catalogView: TutorialCatalogViewState) => void;
}

/**
 * Cross-component tutorial interaction state for the current browser session.
 *
 * Server-owned tutorial data stays with the screen that fetched it. This store
 * only remembers which overlay is visible, the displayed run, and the catalog
 * view to restore after visiting tutorial detail.
 */
export const useTutorialSessionStore = create<TutorialSessionState>()((set) => ({
  openSurface: 'none',
  activeRunId: null,
  activeTutorialId: null,
  activeStepId: null,
  activeExperience: null,
  catalogView: {
    search: '',
    filters: [],
    scrollTop: 0,
  },
  setOpenSurface: (openSurface) => set({ openSurface }),
  setActiveRunId: (activeRunId) => set({ activeRunId }),
  setActiveExperience: (activeExperience) => set({ activeExperience }),
  setActiveTutorial: (input) =>
    set(
      input === null
        ? { activeTutorialId: null, activeStepId: null, activeExperience: null }
        : {
            activeTutorialId: input.tutorialId,
            activeStepId: input.stepId,
            activeExperience: input.experience,
          },
    ),
  setCatalogView: (catalogView) =>
    set({
      catalogView: {
        ...catalogView,
        filters: [...catalogView.filters],
      },
    }),
}));

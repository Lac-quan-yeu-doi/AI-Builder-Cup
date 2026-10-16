'use client';

import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';

/** Workspace-level control that opens tutorials without navigating away. */
export function TutorialEntry() {
  const { t } = useTranslation();
  const setOpenSurface = useTutorialSessionStore((state) => state.setOpenSurface);

  return (
    <Button
      aria-label={t('tutorial.entryLabel')}
      className="fixed right-4 bottom-4 z-30 shadow-100"
      onClick={() => setOpenSurface('catalog')}
    >
      {t('tutorial.entry')}
    </Button>
  );
}

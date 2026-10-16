import { notFound } from 'next/navigation';

import {
  TutorialVisualHarness,
  type TutorialVisualSurface,
} from '@/app/visual-tests/tutorials/tutorial-visual-harness';

const tutorialVisualSurfaces: readonly TutorialVisualSurface[] = [
  'catalog',
  'detail',
  'walkthrough',
  'spotlight',
  'onboarding',
  'completion',
];

interface TutorialVisualPageProps {
  readonly searchParams: Promise<{ readonly surface?: string | readonly string[] }>;
}

function isTutorialVisualSurface(value: unknown): value is TutorialVisualSurface {
  return typeof value === 'string' && tutorialVisualSurfaces.some((surface) => surface === value);
}

export default async function TutorialVisualPage({ searchParams }: TutorialVisualPageProps) {
  if (process.env.VISUAL_TEST_MODE !== '1') notFound();

  const { surface } = await searchParams;
  if (!isTutorialVisualSurface(surface)) notFound();

  return <TutorialVisualHarness surface={surface} />;
}

'use client';

import { getInjection } from '@/di/container';

import { RepairCaptureScreen } from './repair-capture-screen';
import { RepairGuideScreen } from './repair-guide-screen';
import { RepairGuidedScreen } from './repair-guided-screen';
import { RepairGuidesScreen } from './repair-guides-screen';

const controller = getInjection('RepairGuideController');

export function RepairGuidesFeature({ siteId }: { readonly siteId: string }) {
  return <RepairGuidesScreen controller={controller} siteId={siteId} />;
}

export function RepairCaptureFeature({ siteId }: { readonly siteId: string }) {
  return <RepairCaptureScreen controller={controller} siteId={siteId} />;
}

export function RepairGuideFeature({
  siteId,
  guideId,
}: {
  readonly siteId: string;
  readonly guideId: string;
}) {
  return <RepairGuideScreen controller={controller} siteId={siteId} guideId={guideId} />;
}

export function RepairGuidedFeature({
  siteId,
  guideId,
}: {
  readonly siteId: string;
  readonly guideId: string;
}) {
  return <RepairGuidedScreen controller={controller} siteId={siteId} guideId={guideId} />;
}

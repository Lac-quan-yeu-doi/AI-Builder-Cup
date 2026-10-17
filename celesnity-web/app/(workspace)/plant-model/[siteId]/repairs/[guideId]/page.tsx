import type { Metadata } from 'next';

import { RepairGuideFeature } from '../_components/repair-guides-feature';

export const metadata: Metadata = { title: 'Repair guide' };

export default async function RepairGuidePage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string; readonly guideId: string }>;
}) {
  const { siteId, guideId } = await params;
  return (
    <RepairGuideFeature siteId={decodeURIComponent(siteId)} guideId={decodeURIComponent(guideId)} />
  );
}

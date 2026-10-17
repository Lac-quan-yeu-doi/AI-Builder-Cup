import type { Metadata } from 'next';

import { RepairGuidedFeature } from '../../_components/repair-guides-feature';

export const metadata: Metadata = { title: 'Guided repair' };

export default async function RepairGuidedPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string; readonly guideId: string }>;
}) {
  const { siteId, guideId } = await params;
  return (
    <RepairGuidedFeature
      siteId={decodeURIComponent(siteId)}
      guideId={decodeURIComponent(guideId)}
    />
  );
}

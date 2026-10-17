import type { Metadata } from 'next';

import { RepairCaptureFeature } from '../_components/repair-guides-feature';

export const metadata: Metadata = { title: 'Capture a repair' };

export default async function RepairCapturePage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  return <RepairCaptureFeature siteId={decodeURIComponent(siteId)} />;
}

import type { Metadata } from 'next';

import { RepairGuidesFeature } from './_components/repair-guides-feature';

export const metadata: Metadata = { title: 'Repair know-how' };

export default async function RepairGuidesPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  return <RepairGuidesFeature siteId={decodeURIComponent(siteId)} />;
}

import type { Metadata } from 'next';
import { PlantTwinScreen } from '../_components/plant-twin-screen';

export const metadata: Metadata = { title: '3D twin' };

export default async function PlantTwinPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  return <PlantTwinScreen siteId={decodeURIComponent(siteId)} />;
}

import { redirect } from 'next/navigation';

export default async function PlantModelEditorPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  redirect(`/plant-model/${encodeURIComponent(decodeURIComponent(siteId))}/overview`);
}

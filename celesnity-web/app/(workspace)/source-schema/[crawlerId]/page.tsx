import { redirect } from 'next/navigation';

interface PageProps {
  readonly params: Promise<{ readonly crawlerId: string }>;
}

/**
 * Both this route and `/metadata-crawler/[crawlerId]` rendered
 * `SourceMetadataFeature` — the same component, the same crawler, two URLs.
 * One survives; this one forwards to it.
 */
export default async function SourceSchemaDetailPage({ params }: PageProps) {
  const { crawlerId } = await params;
  redirect(`/metadata-crawler/${encodeURIComponent(crawlerId)}`);
}

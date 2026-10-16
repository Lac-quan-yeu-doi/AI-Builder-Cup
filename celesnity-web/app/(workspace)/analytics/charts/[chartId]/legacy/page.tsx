import type { Metadata } from 'next';
import Link from 'next/link';
import { PageContainer } from '@/app/_components/layout/page-container';
import { Button } from '@/app/_components/ui/button';

export const metadata: Metadata = { title: 'Legacy chart' };

export default async function LegacyChartPage({
  params,
}: {
  readonly params: Promise<{ readonly chartId: string }>;
}) {
  const { chartId } = await params;
  return (
    <PageContainer>
      <main className="space-y-4 rounded-lg border border-border bg-card p-8">
        <p className="text-caption font-medium uppercase text-muted-foreground">Legacy chart</p>
        <h1 className="text-heading-3">Read-only legacy visualization</h1>
        <p className="text-body-sm text-muted-foreground">
          This chart uses the retired data/vl_spec representation. It cannot be edited in place.
          Convert it to a canonical definition and run a fresh preview before saving.
        </p>
        <Link href={`/analytics/charts/new?legacyChartId=${encodeURIComponent(chartId)}`}>
          <Button>Convert to canonical chart</Button>
        </Link>
      </main>
    </PageContainer>
  );
}

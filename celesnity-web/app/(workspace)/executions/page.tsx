import type { Metadata } from 'next';

import { ExecutionMonitoringFeature } from '@/app/_components/execution/execution-monitoring-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata: Metadata = { title: 'Run executions' };

export default async function ExecutionsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly executionId?: string | readonly string[] }>;
}) {
  const requested = (await searchParams).executionId;
  const initialExecutionId = Array.isArray(requested) ? requested[0] : requested;
  return (
    <PageContainer>
      <ExecutionMonitoringFeature initialExecutionId={initialExecutionId} />
    </PageContainer>
  );
}

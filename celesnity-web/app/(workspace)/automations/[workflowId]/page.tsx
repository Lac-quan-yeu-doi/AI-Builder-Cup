import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { AutomationWorkflowDetailFeature } from './_components/automation-workflow-detail-feature';

export const metadata: Metadata = { title: 'Automation workflow' };

interface PageProps {
  readonly params: Promise<{ readonly workflowId: string }>;
}

export default async function AutomationWorkflowDetailPage({ params }: PageProps) {
  const { workflowId } = await params;
  return (
    <PageContainer width="full">
      <AutomationWorkflowDetailFeature workflowId={workflowId} />
    </PageContainer>
  );
}

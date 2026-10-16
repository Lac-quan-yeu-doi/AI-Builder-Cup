import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { DataWorkflowEditorFeature } from '../_components/data-workflow-editor-feature';

export const metadata: Metadata = { title: 'Data workflow' };

export default async function DataWorkflowDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly workflowId: string }>;
}) {
  const { workflowId } = await params;
  return (
    <PageContainer width="full">
      <DataWorkflowEditorFeature workflowId={workflowId} />
    </PageContainer>
  );
}

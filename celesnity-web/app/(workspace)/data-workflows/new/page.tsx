import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { DataWorkflowEditorFeature } from '../_components/data-workflow-editor-feature';

export const metadata: Metadata = { title: 'New data workflow' };

export default function NewDataWorkflowPage() {
  return (
    <PageContainer width="full">
      <DataWorkflowEditorFeature />
    </PageContainer>
  );
}

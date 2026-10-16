import type { Metadata } from 'next';

import { PageContainer } from '@/app/_components/layout/page-container';
import { AutomationWorkflowFeature } from './_components/automation-workflow-feature';

export const metadata: Metadata = { title: 'Automations' };

export default function AutomationsPage() {
  return (
    <PageContainer width="full">
      <AutomationWorkflowFeature />
    </PageContainer>
  );
}

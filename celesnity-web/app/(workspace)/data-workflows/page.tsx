import type { Metadata } from 'next';

import { DataWorkflowFeature } from './_components/data-workflow-feature';

export const metadata: Metadata = { title: 'Data Workflows' };

export default function DataWorkflowsPage() {
  return <DataWorkflowFeature />;
}

import { ScriptWorkbenchFeature } from '@/app/(workspace)/scripts/_components/script-workbench-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata = { title: 'PySpark Scripts' };

export default function ScriptsPage() {
  return (
    <PageContainer>
      <ScriptWorkbenchFeature />
    </PageContainer>
  );
}

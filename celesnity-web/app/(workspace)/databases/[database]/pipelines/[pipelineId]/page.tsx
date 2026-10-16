import { PipelineCanvasFeature } from '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/pipeline-canvas-feature';
import { PageContainer } from '@/app/_components/layout/page-container';

export const metadata = { title: 'Flow Canvas' };

interface PipelineCanvasPageProps {
  readonly params: Promise<{ readonly database: string; readonly pipelineId: string }>;
}

export default async function PipelineCanvasPage({ params }: PipelineCanvasPageProps) {
  const { database, pipelineId } = await params;
  return (
    <PageContainer width="full">
      <PipelineCanvasFeature databaseName={decodeURIComponent(database)} pipelineId={pipelineId} />
    </PageContainer>
  );
}

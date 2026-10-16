import { ExecutableWorkloadProvider } from '@application/execution-orchestration/executable-workload.provider';
import type { ICompiledPipelineProvider } from '@application/pipeline-compilation/interfaces/i-compiled-pipeline-provider';
import type { IPublishedScriptProvider } from '@application/script-authoring/interfaces/i-published-script-provider';

const PIPELINE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

function provider(versionId = VERSION_ID): ExecutableWorkloadProvider {
  const pipelines: ICompiledPipelineProvider = {
    resolveCompiledVersion: jest.fn().mockResolvedValue({
      pipelineId: PIPELINE_ID,
      pipelineVersionId: versionId,
      versionNumber: 3,
      connectionId: CONNECTION_ID,
      source: 'print("pipeline")',
    }),
  };
  return new ExecutableWorkloadProvider({} as IPublishedScriptProvider, pipelines);
}

describe('ExecutableWorkloadProvider pipeline workloads', () => {
  it('resolves immutable generated source into the shared Spark workload contract', async () => {
    await expect(provider().resolvePipeline(PIPELINE_ID, 3)).resolves.toEqual({
      workload: {
        kind: 'PIPELINE',
        pipelineId: PIPELINE_ID,
        pipelineVersionId: VERSION_ID,
        versionNumber: 3,
      },
      connectionId: CONNECTION_ID,
      source: 'print("pipeline")',
    });
  });

  it('rejects a changed artifact identity while a queued execution is being claimed', async () => {
    const changedVersionId = '44444444-4444-4444-8444-444444444444';

    await expect(
      provider(changedVersionId).resolve({
        kind: 'PIPELINE',
        pipelineId: PIPELINE_ID,
        pipelineVersionId: VERSION_ID,
        versionNumber: 3,
      }),
    ).rejects.toThrow('The execution changed while it was being updated.');
  });
});

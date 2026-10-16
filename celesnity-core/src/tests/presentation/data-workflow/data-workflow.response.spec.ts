import { DataWorkflowRunResponseDto } from '@presentation/data-workflow/data-workflow.response';
import type { WorkflowRunSnapshot } from '@application/data-workflow/interfaces/i-workflow-run-repository';

const now = new Date('2026-09-24T00:00:00.000Z');

describe('DataWorkflowRunResponseDto', () => {
  it('uses the run version names and reports recovered failure without hiding the failed attempt', () => {
    const snapshot: WorkflowRunSnapshot = {
      run: {
        id: 'run',
        organizationId: 'org',
        workflowId: 'workflow',
        versionId: 'old-version',
        actor: 'actor',
        parameters: {},
        triggerContext: {},
        status: 'SUCCEEDED',
        revision: 3,
        nextReconciliationAt: now,
        createdAt: now,
        updatedAt: now,
      },
      version: {
        id: 'old-version',
        organizationId: 'org',
        workflowId: 'workflow',
        versionNumber: 1,
        graph: {
          nodes: [
            { id: 'trigger', type: 'TRIGGER' },
            { id: 'a', type: 'PIPELINE', pipelineId: 'pipeline-a', versionNumber: 1 },
            { id: 'route', type: 'PIPELINE_OUTCOME' },
            { id: 'b', type: 'PIPELINE', pipelineId: 'pipeline-b', versionNumber: 1 },
          ],
          edges: [
            {
              id: 'start',
              sourceNodeId: 'trigger',
              sourcePortId: 'out',
              targetNodeId: 'a',
              targetPortId: 'in',
            },
            {
              id: 'inspect',
              sourceNodeId: 'a',
              sourcePortId: 'out',
              targetNodeId: 'route',
              targetPortId: 'in',
            },
            {
              id: 'recover',
              sourceNodeId: 'route',
              sourcePortId: 'error',
              targetNodeId: 'b',
              targetPortId: 'in',
            },
          ],
        },
        trigger: {},
        pipelineDisplayNames: { a: 'Orders ingest', b: 'Recovery job' },
        publishedAt: now,
      },
      nodeAttempts: [
        {
          id: 'failed',
          organizationId: 'org',
          runId: 'run',
          nodeId: 'a',
          attemptNumber: 1,
          state: 'FAILED',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'recovered',
          organizationId: 'org',
          runId: 'run',
          nodeId: 'b',
          attemptNumber: 1,
          state: 'SUCCEEDED',
          createdAt: now,
          updatedAt: now,
        },
      ],
      edgeStates: [
        {
          id: 'edge',
          organizationId: 'org',
          runId: 'run',
          edgeId: 'recover',
          state: 'SUCCEEDED',
          updatedAt: now,
        },
      ],
    };

    const response = DataWorkflowRunResponseDto.from(snapshot);
    expect(response.recoveredFailure).toBe(true);
    expect(response.versionId).toBe('old-version');
    expect(response.selectedOutcomeRoutes).toEqual([{ nodeId: 'route', portId: 'error' }]);
    expect(response.nodeDisplayNames).toEqual({ a: 'Orders ingest', b: 'Recovery job' });
    expect(response.attempts).toContainEqual(
      expect.objectContaining({ nodeId: 'a', state: 'FAILED' }),
    );
  });
});

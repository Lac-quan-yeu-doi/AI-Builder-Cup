import { PipelineOutputFactsEventParser } from '@application/execution-orchestration/pipeline-output-facts-event-parser';
import type { ExecutionOutputConditionPlan } from '@domain/execution-orchestration/models/execution-output-facts';

const EXECUTION_ID = '46e0a6fd-3e0f-41b2-8f69-490db51d5eb6';
const TARGET_ID = 'target-node-1';
const BRANCH_ID = 'branch-1';
const PLAN: ExecutionOutputConditionPlan = {
  targets: [
    {
      targetNodeId: TARGET_ID,
      predicates: [{ branchId: BRANCH_ID, column: 'amount', operator: 'GT', value: 100 }],
    },
  ],
};

function event(overrides: Readonly<Record<string, unknown>> = {}): string {
  return `CELESNITY_EVENT ${JSON.stringify({
    event: 'PIPELINE_OUTPUT_FACTS',
    pipelineId: 'pipeline-1',
    pipelineVersion: 2,
    executionId: EXECUTION_ID,
    targetNodeId: TARGET_ID,
    totalRows: 4,
    matchesByBranchId: { [BRANCH_ID]: 2 },
    ...overrides,
  })}\n`;
}

describe('PipelineOutputFactsEventParser', () => {
  it('parses an execution-bound fact event split across arbitrary output chunks', () => {
    const parser = new PipelineOutputFactsEventParser(EXECUTION_ID, PLAN);
    const text = event();
    parser.consume(text.slice(0, 19));
    parser.consume(text.slice(19, 63));
    parser.consume(text.slice(63));

    expect(parser.finish()).toEqual({
      executionId: EXECUTION_ID,
      targets: [
        {
          targetNodeId: TARGET_ID,
          totalRows: 4,
          matchesByBranchId: { [BRANCH_ID]: 2 },
        },
      ],
    });
  });

  it('rejects a missing target fact', () => {
    const parser = new PipelineOutputFactsEventParser(EXECUTION_ID, PLAN);
    expect(() => parser.finish()).toThrow('without all requested target result facts');
  });

  it('rejects facts bound to another execution', () => {
    const parser = new PipelineOutputFactsEventParser(EXECUTION_ID, PLAN);
    expect(() => parser.consume(event({ executionId: 'another-execution' }))).toThrow(
      'invalid or mismatched execution identity',
    );
  });

  it('rejects duplicate target events instead of silently accepting one', () => {
    const parser = new PipelineOutputFactsEventParser(EXECUTION_ID, PLAN);
    parser.consume(event());
    expect(() => parser.consume(event())).toThrow('duplicate result facts');
  });

  it('rejects branch mismatches and counts outside the total', () => {
    const wrongBranch = new PipelineOutputFactsEventParser(EXECUTION_ID, PLAN);
    expect(() =>
      wrongBranch.consume(event({ matchesByBranchId: { other: 1 } })),
    ).toThrow('do not match the requested branches');

    const wrongCount = new PipelineOutputFactsEventParser(EXECUTION_ID, PLAN);
    expect(() => wrongCount.consume(event({ matchesByBranchId: { [BRANCH_ID]: 5 } }))).toThrow(
      'invalid matching row count',
    );
  });

  it('ignores non-fact pipeline events while retaining the required target result', () => {
    const parser = new PipelineOutputFactsEventParser(EXECUTION_ID, PLAN);
    parser.consume(
      `CELESNITY_EVENT ${JSON.stringify({ event: 'NODE_STARTED', nodeId: 'node-1' })}\n${event()}`,
    );
    expect(parser.finish().targets).toHaveLength(1);
  });
});

import { buildStepResolutionContext } from '@application/automation-workflow/build-step-resolution-context';
import type { AutomationWorkflowStepRun } from '@domain/automation-workflow/models/automation-workflow-step-run';

function stepRun(overrides: Partial<AutomationWorkflowStepRun> = {}): AutomationWorkflowStepRun {
  return {
    id: 's',
    runId: 'r',
    stepId: 'st',
    status: 'success',
    output: 'default-output',
    ...overrides,
  } as AutomationWorkflowStepRun;
}

describe('buildStepResolutionContext', () => {
  it('nests the trigger payload and each prior step output by 1-based position', () => {
    const context = buildStepResolutionContext({ bucket: 'ingest-bucket' }, [
      stepRun({ output: 'schema extracted' }),
      stepRun({ output: 'summary written' }),
    ]);
    expect(context).toEqual({
      trigger: { bucket: 'ingest-bucket' },
      step1: { output: 'schema extracted' },
      step2: { output: 'summary written' },
    });
  });

  it('omits a step key entirely when that step run has no output yet', () => {
    const context = buildStepResolutionContext({ bucket: 'x' }, [stepRun({ output: undefined })]);
    expect(context).toEqual({ trigger: { bucket: 'x' } });
  });
});

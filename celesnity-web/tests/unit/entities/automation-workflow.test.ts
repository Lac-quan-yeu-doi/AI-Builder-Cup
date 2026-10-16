import { describe, expect, it } from 'vitest';

import {
  triggerInputSpecs,
  type AutomationWorkflow,
  type AutomationWorkflowStep,
  type AutomationWorkflowTriggerField,
} from '@/src/entities/models/automation-workflow';

function step(
  order: number,
  inputTemplate: Readonly<Record<string, string>>,
): AutomationWorkflowStep {
  return { id: `step-${order}`, order, agentId: 'chat-assistant', inputTemplate };
}

function workflow(
  steps: readonly AutomationWorkflowStep[],
  triggerFields: readonly AutomationWorkflowTriggerField[] = [],
): AutomationWorkflow {
  return {
    id: 'wf-1',
    name: 'Test workflow',
    status: 'enabled',
    triggerType: 'EVENT',
    createdAt: '2026-09-04T00:00:00.000Z',
    triggerFields,
    steps,
  };
}

describe('triggerInputSpecs', () => {
  it('maps declared trigger fields, defaulting required to true and carrying type/label', () => {
    const specs = triggerInputSpecs(
      workflow(
        [step(1, { message: 'Run for $.trigger.run_date' })],
        [
          { name: 'run_date', type: 'date', label: 'Run date' },
          { name: 'amount', type: 'number', required: false },
          { name: 'active', type: 'boolean', required: true },
        ],
      ),
    );
    expect(specs).toEqual([
      { name: 'run_date', type: 'date', label: 'Run date', required: true },
      { name: 'amount', type: 'number', required: false },
      { name: 'active', type: 'boolean', required: true },
    ]);
  });

  it('falls back to scanning $.trigger.<name> refs only, as required text fields', () => {
    const specs = triggerInputSpecs(
      workflow([
        step(1, { message: 'A new demo order from $.trigger.customer_name for $.trigger.amount.' }),
      ]),
    );
    expect(specs).toEqual([
      { name: 'customer_name', type: 'text', required: true },
      { name: 'amount', type: 'text', required: true },
    ]);
  });

  it('excludes $.step<N>.output references from the fallback — only trigger inputs are prompted', () => {
    const specs = triggerInputSpecs(
      workflow([
        step(1, { message: 'Use $.trigger.bucket' }),
        step(2, { message: 'Summarize $.step1.output and $.step2.output' }),
      ]),
    );
    expect(specs).toEqual([{ name: 'bucket', type: 'text', required: true }]);
  });

  it('deduplicates a trigger field referenced more than once, in first-appearance order', () => {
    const specs = triggerInputSpecs(
      workflow([
        step(1, { message: '$.trigger.name said hello.' }),
        step(2, { message: '$.trigger.name also said goodbye.' }),
      ]),
    );
    expect(specs).toEqual([{ name: 'name', type: 'text', required: true }]);
  });

  it('returns an empty array for a workflow with no declared fields and no trigger refs', () => {
    const specs = triggerInputSpecs(
      workflow([step(1, { message: "Summarize yesterday's demo orders." })]),
    );
    expect(specs).toEqual([]);
  });

  it('returns an empty array for a workflow with no steps and no declared fields', () => {
    const specs = triggerInputSpecs(workflow([]));
    expect(specs).toEqual([]);
  });

  it('does not swallow a trailing sentence period into the fallback field name', () => {
    const specs = triggerInputSpecs(
      workflow([step(1, { message: 'Order total: $.trigger.amount.' })]),
    );
    expect(specs).toEqual([{ name: 'amount', type: 'text', required: true }]);
  });
});

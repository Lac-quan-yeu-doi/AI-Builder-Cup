// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutomationWorkflowChain } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-chain';
import type { AutomationWorkflowStepViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';

const steps: readonly AutomationWorkflowStepViewModel[] = [
  {
    id: 'step-1',
    order: 0,
    agentId: 'schema-extractor',
    inputTemplate: { message: '$.trigger.bucket' },
  },
  { id: 'step-2', order: 1, agentId: 'summarizer', inputTemplate: { message: '$.step1.output' } },
];

afterEach(cleanup);

describe('AutomationWorkflowChain', () => {
  it('renders one card per step, in order', () => {
    render(
      createElement(AutomationWorkflowChain, { steps, selectedStepId: null, onSelect: vi.fn() }),
    );
    expect(screen.getByText('schema-extractor')).toBeTruthy();
    expect(screen.getByText('summarizer')).toBeTruthy();
  });

  it('clicking a step card calls onSelect with that step’s id', () => {
    const onSelect = vi.fn();
    render(createElement(AutomationWorkflowChain, { steps, selectedStepId: null, onSelect }));
    fireEvent.click(screen.getByText('summarizer'));
    expect(onSelect).toHaveBeenCalledWith('step-2');
  });

  it('clicking the already-selected step card calls onSelect with null', () => {
    const onSelect = vi.fn();
    render(createElement(AutomationWorkflowChain, { steps, selectedStepId: 'step-2', onSelect }));
    fireEvent.click(screen.getByText('summarizer'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows the empty-state message when there are no steps', () => {
    render(
      createElement(AutomationWorkflowChain, {
        steps: [],
        selectedStepId: null,
        onSelect: vi.fn(),
      }),
    );
    expect(screen.getByText('No steps yet. Add the first agent to run.')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutomationWorkflowNodeInspector } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-node-inspector';
import type { AutomationWorkflowStepViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';

const step: AutomationWorkflowStepViewModel = {
  id: 'step-1',
  order: 0,
  agentId: 'schema-extractor',
  inputTemplate: { message: '$.trigger.bucket' },
};

afterEach(cleanup);

describe('AutomationWorkflowNodeInspector', () => {
  it('shows the empty-state placeholder when no step is selected', () => {
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step: null,
        busy: false,
        onSave: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(screen.getByText('Select a step to inspect it.')).toBeTruthy();
  });

  it('pre-fills the form with the selected step’s current values', () => {
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step,
        busy: false,
        onSave: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(screen.getByDisplayValue('schema-extractor')).toBeTruthy();
    expect(screen.getByDisplayValue(/\$\.trigger\.bucket/)).toBeTruthy();
  });

  it('Save parses the input-template JSON and calls onSave with the edited values', () => {
    const onSave = vi.fn();
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step,
        busy: false,
        onSave,
        onRemove: vi.fn(),
      }),
    );

    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'summarizer' } });
    fireEvent.change(screen.getByLabelText('Input template'), {
      target: { value: '{"message": "$.step1.output"}' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith({
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    });
  });

  it('Save includes the edited systemPrompt override in the patch', () => {
    const onSave = vi.fn();
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step,
        busy: false,
        onSave,
        onRemove: vi.fn(),
      }),
    );

    fireEvent.change(screen.getByLabelText('System prompt'), {
      target: { value: 'You are a terse summarizer.' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith({
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a terse summarizer.',
    });
  });

  it('Save omits systemPrompt from the patch when the textarea is left empty', () => {
    const onSave = vi.fn();
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step,
        busy: false,
        onSave,
        onRemove: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith({
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
  });

  it('pre-fills the systemPrompt textarea with the step’s current override', () => {
    const withPrompt: AutomationWorkflowStepViewModel = {
      ...step,
      systemPrompt: 'You are a schema extractor.',
    };
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step: withPrompt,
        busy: false,
        onSave: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(screen.getByDisplayValue('You are a schema extractor.')).toBeTruthy();
  });

  it('Save shows an inline error and does not call onSave when the input template is invalid JSON', () => {
    const onSave = vi.fn();
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step,
        busy: false,
        onSave,
        onRemove: vi.fn(),
      }),
    );

    fireEvent.change(screen.getByLabelText('Input template'), { target: { value: 'not json' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Input template must be a JSON object of strings.')).toBeTruthy();
  });

  it('Remove step calls onRemove', () => {
    const onRemove = vi.fn();
    render(
      createElement(AutomationWorkflowNodeInspector, {
        step,
        busy: false,
        onSave: vi.fn(),
        onRemove,
      }),
    );
    fireEvent.click(screen.getByText('Remove step'));
    expect(onRemove).toHaveBeenCalled();
  });
});

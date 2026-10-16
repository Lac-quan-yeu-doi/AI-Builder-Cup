'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/app/_components/ui/button';
import { InlineError } from '@/app/_components/ui/page-alert';
import { TextField, TextareaField } from '@/app/_components/ui/fields';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { AutomationWorkflowStepViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';

export interface AutomationWorkflowNodeInspectorProps {
  readonly step: AutomationWorkflowStepViewModel | null;
  readonly busy: boolean;
  readonly onSave: (patch: {
    agentId: string;
    inputTemplate: Record<string, string>;
    systemPrompt?: string;
  }) => void;
  readonly onRemove: () => void;
}

function parseInputTemplate(text: string): Record<string, string> {
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.values(parsed).some((value) => typeof value !== 'string')
  ) {
    throw new Error('invalid');
  }
  return parsed as Record<string, string>;
}

export function AutomationWorkflowNodeInspector({
  step,
  busy,
  onSave,
  onRemove,
}: AutomationWorkflowNodeInspectorProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string>();

  if (!step) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {t('automationWorkflow.selectStepPrompt')}
      </p>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const form = new FormData(event.currentTarget);
    let inputTemplate: Record<string, string>;
    try {
      inputTemplate = parseInputTemplate(String(form.get('inputTemplate') ?? '{}'));
    } catch {
      setFormError(t('automationWorkflow.invalidInputTemplate'));
      return;
    }
    const systemPrompt = String(form.get('systemPrompt') ?? '').trim();
    onSave({
      agentId: String(form.get('agentId') ?? '').trim(),
      inputTemplate,
      ...(systemPrompt !== '' ? { systemPrompt } : {}),
    });
  }

  return (
    <form className="grid gap-3 p-3" onSubmit={submit}>
      <TextField
        label={t('automationWorkflow.agentId')}
        name="agentId"
        required
        defaultValue={step.agentId}
        placeholder={t('automationWorkflow.agentIdPlaceholder')}
      />
      <TextareaField
        label={t('automationWorkflow.inputTemplate')}
        name="inputTemplate"
        hint={t('automationWorkflow.inputTemplateHint')}
        defaultValue={JSON.stringify(step.inputTemplate, null, 2)}
      />
      <TextareaField
        label={t('automationWorkflow.systemPrompt')}
        name="systemPrompt"
        hint={t('automationWorkflow.systemPromptHint')}
        defaultValue={step.systemPrompt ?? ''}
      />
      {formError ? <InlineError>{formError}</InlineError> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {t('automationWorkflow.save')}
        </Button>
      </div>
      <Button
        type="button"
        size="xs"
        variant="destructive-ghost"
        onClick={onRemove}
        disabled={busy}
      >
        {t('automationWorkflow.removeStep')}
      </Button>
    </form>
  );
}

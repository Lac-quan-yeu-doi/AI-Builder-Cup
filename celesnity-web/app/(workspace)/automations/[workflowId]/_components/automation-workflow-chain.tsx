'use client';

import { ChevronRightIcon } from 'lucide-react';

import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { AutomationWorkflowStepViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';

export interface AutomationWorkflowChainProps {
  readonly steps: readonly AutomationWorkflowStepViewModel[];
  readonly selectedStepId: string | null;
  readonly onSelect: (stepId: string | null) => void;
}

export function AutomationWorkflowChain({
  steps,
  selectedStepId,
  onSelect,
}: AutomationWorkflowChainProps) {
  const { t } = useTranslation();

  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('automationWorkflow.noSteps')}</p>;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, index) => {
        const selected = step.id === selectedStepId;
        return (
          <div className="flex shrink-0 items-center gap-1" key={step.id}>
            {index > 0 ? (
              <ChevronRightIcon
                aria-hidden="true"
                className="shrink-0 text-muted-foreground/60"
                size={18}
              />
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(selected ? null : step.id)}
              className={cn(
                'flex w-[190px] shrink-0 items-center gap-2.5 rounded-lg border p-3 text-left shadow-sm transition-colors',
                selected ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full font-mono text-caption font-semibold',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {step.order + 1}
              </span>
              <span className="min-w-0">
                <span className="m-0 block font-mono text-micro text-muted-foreground">
                  {t('automationWorkflow.stepLabel', { number: step.order + 1 })}
                </span>
                <span className="mt-0.5 block truncate font-mono text-sm font-semibold">
                  {step.agentId}
                </span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

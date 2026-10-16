'use client';

import { ArrowRightIcon, CableIcon, Table2Icon, WorkflowIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';

import { FLOW_STAGES, type FlowStage } from './database-flow-stage';

/** Where the call to action lands. */
type DatabaseTab = FlowStage | 'runs';

interface StepCopy {
  readonly icon: LucideIcon;
  readonly title: TranslationKey;
  readonly body: TranslationKey;
  readonly action: TranslationKey;
  /**
   * The tab that carries the control. `tables` is the odd one: nothing is
   * created there, so its call to action goes back to the pipeline that has to
   * run before a table can exist.
   */
  readonly tab: DatabaseTab;
}

const STEPS: Record<FlowStage, StepCopy> = {
  sources: {
    icon: CableIcon,
    title: 'database.next.sources.title',
    body: 'database.next.sources.body',
    action: 'database.next.sources.action',
    tab: 'sources',
  },
  pipelines: {
    icon: WorkflowIcon,
    title: 'database.next.pipelines.title',
    body: 'database.next.pipelines.body',
    action: 'database.next.pipelines.action',
    tab: 'pipelines',
  },
  tables: {
    icon: Table2Icon,
    title: 'database.next.tables.title',
    body: 'database.next.tables.body',
    action: 'database.next.tables.action',
    tab: 'pipelines',
  },
};

interface DatabaseNextStepProps {
  readonly onGo: (tab: DatabaseTab) => void;
  readonly stage: FlowStage;
}

/**
 * One instruction, for the one stage that is holding the database up.
 *
 * An empty database used to open on "No tables yet" with a "Build a pipeline"
 * button — an action that cannot succeed before a source exists, offered at the
 * end of a flow the visitor has not started. This names the step they are
 * actually on, says what it is for, and puts the only button on screen next to
 * it.
 */
export function DatabaseNextStep({ onGo, stage }: DatabaseNextStepProps) {
  const { t } = useTranslation();
  const step = STEPS[stage];
  const Icon = step.icon;

  return (
    <Card
      className={cardClass}
      // Announced on arrival: on an empty database this is the only thing to do,
      // and a visitor tabbing in should not have to find it first.
      role="region"
      aria-label={t(step.title)}
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
      >
        <Icon size={20} />
      </span>

      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t('database.next.step', {
              step: FLOW_STAGES.indexOf(stage) + 1,
              total: FLOW_STAGES.length,
            })}
          </Badge>
          <strong className="text-body-sm font-[650] tracking-[-0.01em]">{t(step.title)}</strong>
        </div>
        <p className="m-0 max-w-[62ch] text-body-sm leading-[1.55] text-muted-foreground">
          {t(step.body)}
        </p>
      </div>

      <Button className="shrink-0 md:ml-auto" onClick={() => onGo(step.tab)} size="sm">
        {t(step.action)}
        <ArrowRightIcon size={17} />
      </Button>
    </Card>
  );
}

const cardClass = [
  'flex flex-col items-start gap-3.5 border-primary/25 bg-accent/50 p-4',
  'md:flex-row md:items-center',
].join(' ');

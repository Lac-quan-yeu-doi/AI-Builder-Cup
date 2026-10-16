import { Badge } from '@/app/_components/ui/badge';
import type {
  AutomationWorkflowRunStatus,
  AutomationWorkflowStatus,
  AutomationWorkflowStepRunStatus,
} from '@/src/entities/models/automation-workflow';
import type { Translator } from '@/app/_i18n/translate';

export function AutomationWorkflowStatusBadge({
  status,
  t,
}: {
  readonly status: AutomationWorkflowStatus;
  readonly t: Translator;
}) {
  return (
    <Badge variant={status === 'enabled' ? 'success' : 'outline'}>
      {t(`automationWorkflow.${status}`)}
    </Badge>
  );
}

export function AutomationWorkflowRunStatusBadge({
  status,
  t,
}: {
  readonly status: AutomationWorkflowRunStatus | AutomationWorkflowStepRunStatus;
  readonly t: Translator;
}) {
  const tone = status === 'success' ? 'success' : status === 'failed' ? 'danger' : 'info';
  return <Badge variant={tone}>{t(`automationWorkflow.${status}`)}</Badge>;
}

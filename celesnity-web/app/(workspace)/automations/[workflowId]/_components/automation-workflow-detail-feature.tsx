'use client';

import { getInjection } from '@/di/container';
import { useCurrentUserId } from '@/app/_providers/current-user-provider';
import { AutomationWorkflowDetailScreen } from './automation-workflow-detail-screen';

const controller = getInjection('AutomationWorkflowController');
const chatController = getInjection('ManageChatController');

interface Props {
  readonly workflowId: string;
}

export function AutomationWorkflowDetailFeature({ workflowId }: Props) {
  const userId = useCurrentUserId();
  return (
    <AutomationWorkflowDetailScreen
      controller={controller}
      workflowId={workflowId}
      listRunFiles={(runId) => chatController.listRunFiles(userId, runId)}
      getRunFileContent={(runId, path) => chatController.getRunFileContent(userId, runId, path)}
    />
  );
}

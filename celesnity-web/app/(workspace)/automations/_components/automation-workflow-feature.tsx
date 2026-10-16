'use client';

import { getInjection } from '@/di/container';
import { AutomationWorkflowScreen } from './automation-workflow-screen';

const controller = getInjection('AutomationWorkflowController');

export function AutomationWorkflowFeature() {
  return <AutomationWorkflowScreen controller={controller} />;
}

'use client';

import { getInjection } from '@/di/container';

import { DataWorkflowScreen } from './data-workflow-screen';

const controller = getInjection('DataWorkflowController');

export function DataWorkflowFeature() {
  return <DataWorkflowScreen controller={controller} />;
}

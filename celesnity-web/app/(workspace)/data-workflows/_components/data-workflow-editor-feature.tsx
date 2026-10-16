'use client';

import { getInjection } from '@/di/container';

import { DataWorkflowEditorScreen } from './data-workflow-editor-screen';

const controller = getInjection('DataWorkflowController');
const listPipelines = getInjection('ListPipelinesController');

export function DataWorkflowEditorFeature({ workflowId }: { readonly workflowId?: string }) {
  return (
    <DataWorkflowEditorScreen
      controller={controller}
      listPipelines={listPipelines}
      workflowId={workflowId}
    />
  );
}

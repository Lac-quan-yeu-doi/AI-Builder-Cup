'use client';

import { useRouter } from 'next/navigation';

import { getInjection } from '@/di/container';

import { ExecutionsScreen } from './executions-screen';

const controllers = Object.freeze({
  list: getInjection('ListExecutionsController'),
  get: getInjection('GetExecutionController'),
  cancel: getInjection('CancelExecutionController'),
  getLogs: getInjection('GetExecutionLogsController'),
  rerun: getInjection('RerunExecutionController'),
  monitor: getInjection('MonitorExecutionController'),
  listPipelines: getInjection('ListPipelinesController'),
});

export function ExecutionMonitoringFeature({
  initialExecutionId,
  pipelineIds,
  embedded = false,
}: {
  readonly initialExecutionId?: string;
  readonly pipelineIds?: readonly string[];
  /**
   * Rendered inside a container, which already supplies the heading — and owns
   * the URL.
   *
   * Selecting a run used to write `/executions?executionId=…` unconditionally,
   * so choosing one from inside a database's Runs tab navigated out of the
   * database. Embedded, selection stays in component state and the address bar
   * is left to the container's own `?tab=`.
   */
  readonly embedded?: boolean;
} = {}) {
  const router = useRouter();
  return (
    <ExecutionsScreen
      controllers={controllers}
      {...(pipelineIds ? { pipelineIds } : {})}
      embedded={embedded}
      initialExecutionId={initialExecutionId}
      {...(embedded
        ? {}
        : {
            onSelectionChange: (executionId: string) => {
              router.replace(`/executions?executionId=${encodeURIComponent(executionId)}`, {
                scroll: false,
              });
            },
          })}
    />
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

import type { MonitorExecutionController } from '@/src/interface-adapters/controllers/executions/monitor-execution.controller';
import type {
  ExecutionDetailViewModel,
  ExecutionProgressViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';
import { releaseMonitor } from '@/app/_components/shared/monitor-lifecycle';

export type LiveProgressMode = 'idle' | 'streaming' | 'polling';

interface UseExecutionLiveProgressOptions {
  readonly monitor: MonitorExecutionController;
  readonly executionId: string | undefined;
  /** Watch only while an execution is selected and still in flight. */
  readonly enabled: boolean;
  readonly onProgress: (progress: ExecutionProgressViewModel) => void;
  readonly onSnapshot: (detail: ExecutionDetailViewModel) => void;
}

/** Keeps React callbacks current while the application monitor owns transport and scheduling. */
export function useExecutionLiveProgress({
  monitor,
  executionId,
  enabled,
  onProgress,
  onSnapshot,
}: UseExecutionLiveProgressOptions): LiveProgressMode {
  const [mode, setMode] = useState<LiveProgressMode>('idle');
  const onProgressRef = useRef(onProgress);
  const onSnapshotRef = useRef(onSnapshot);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const liveMonitorRef = useRef<ReturnType<MonitorExecutionController> | null>(null);

  useEffect(() => {
    onProgressRef.current = onProgress;
    onSnapshotRef.current = onSnapshot;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      liveMonitorRef.current = releaseMonitor(liveMonitorRef.current);
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    liveMonitorRef.current = releaseMonitor(liveMonitorRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a changed selection has no active transport yet
    setMode('idle');
  }, [monitor, executionId]);

  useEffect(() => {
    if (!executionId || !enabled || liveMonitorRef.current) {
      return;
    }

    const generation = generationRef.current;
    const isActive = () => mountedRef.current && generationRef.current === generation;
    let becameIdleSynchronously = false;
    const liveMonitor = monitor(executionId, {
      onProgress: (progress) => {
        if (isActive()) {
          onProgressRef.current(progress);
        }
      },
      onSnapshot: (detail) => {
        if (isActive()) {
          onSnapshotRef.current(detail);
        }
      },
      onMode: (nextMode) => {
        if (isActive()) {
          if (nextMode === 'idle') {
            becameIdleSynchronously = true;
            liveMonitorRef.current = null;
          }
          setMode(nextMode);
        }
      },
      onError: () => undefined,
    });

    if (isActive() && !becameIdleSynchronously) {
      liveMonitorRef.current = liveMonitor;
    } else {
      releaseMonitor(liveMonitor);
    }
  }, [monitor, executionId, enabled]);

  return mode;
}

'use client';

import type { Translator } from '@/app/_i18n/translate';

import type { Artifact } from './chat-stage.types';
import { RunInspectorContent, type RunInspectorContentProps } from '../run-inspector-modal';

export function runArtifact(runId: string, t: Translator): Artifact {
  return {
    id: `terminal:${runId}`,
    kind: 'terminal',
    title: t('chat.pane.title.run', { id: runId }),
    meta: t('chat.pane.kind.terminal'),
  };
}

/**
 * Mounts `RunInspectorContent` (manifest/trace-graph/report/validation tabs,
 * extracted from `RunInspectorModal`'s modal chrome) as pane content — one
 * pane kind covers the whole inspector, including its "graph" tab
 * (`RunProvenanceGraph`), which is already internal to it.
 */
export function TerminalPane(props: RunInspectorContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <RunInspectorContent {...props} />
    </div>
  );
}

'use client';

import type { Translator } from '@/app/_i18n/translate';

import type { Artifact } from './chat-stage.types';
import { AgentInfoContent } from '../agent-info-panel';

export function agentInfoArtifact(t: Translator): Artifact {
  return {
    id: 'document:agent-info',
    kind: 'document',
    title: t('chat.pane.title.agentInfo'),
    meta: t('chat.pane.kind.document'),
  };
}

/** Mounts `AgentInfoContent` (extracted from `AgentInfoPanel`'s modal chrome) as pane content. */
export function DocumentPane() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AgentInfoContent />
    </div>
  );
}

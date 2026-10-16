'use client';

import type { Translator } from '@/app/_i18n/translate';

import type { Artifact } from './chat-stage.types';
import { ApplicationStatePanel, type ApplicationStatePanelProps } from '../application-state-panel';

export function applicationStateArtifact(t: Translator): Artifact {
  return {
    id: 'table:application-state',
    kind: 'table',
    title: t('chat.pane.title.applicationState'),
    meta: t('chat.pane.kind.table'),
  };
}

export function TablePane(props: ApplicationStatePanelProps) {
  return (
    <div className="p-4">
      <ApplicationStatePanel {...props} />
    </div>
  );
}

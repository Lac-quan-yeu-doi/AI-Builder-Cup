'use client';

import type { Translator } from '@/app/_i18n/translate';

import type { Artifact } from './chat-stage.types';
import { AutomationsSidebar, type AutomationsSidebarProps } from '../automations-sidebar';

export function automationsArtifact(t: Translator): Artifact {
  return {
    id: 'automation:list',
    kind: 'automation',
    title: t('chat.pane.title.automations'),
    meta: t('chat.pane.kind.automation'),
  };
}

export function AutomationPane(props: AutomationsSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AutomationsSidebar {...props} />
    </div>
  );
}

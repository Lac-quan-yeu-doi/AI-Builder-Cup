'use client';

import { useState, type CSSProperties } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { AutomationWorkflowStepViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';
import {
  AssistantResizeHandle,
  useAssistantSurfaceWidth,
} from '@/app/_components/assistant/assistant-resize-handle';

import { AutomationWorkflowChatPanel } from './automation-workflow-chat-panel';
import { AutomationWorkflowNodeInspector } from './automation-workflow-node-inspector';

export interface AutomationWorkflowDockProps {
  readonly workflowId: string;
  readonly workflowName: string;
  readonly onWorkflowChanged: () => void;
  readonly selectedStep: AutomationWorkflowStepViewModel | null;
  readonly stepBusy: boolean;
  readonly onSaveStep: (patch: {
    agentId: string;
    inputTemplate: Record<string, string>;
    systemPrompt?: string;
  }) => void;
  readonly onRemoveStep: () => void;
}

type DockTab = 'chat' | 'node';

export function AutomationWorkflowDock({
  workflowId,
  workflowName,
  onWorkflowChanged,
  selectedStep,
  stepBusy,
  onSaveStep,
  onRemoveStep,
}: AutomationWorkflowDockProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DockTab>(selectedStep === null ? 'chat' : 'node');
  const [trackedStepId, setTrackedStepId] = useState<string | null>(selectedStep?.id ?? null);

  // Adjusting state during render (React's documented pattern for syncing to
  // a prop change) rather than in an effect. Selecting a step always surfaces
  // its inspector — even re-selecting a different step while the Chat tab is
  // showing jumps back to Step, mirroring the chain's click behavior (only
  // deselecting, i.e. going back to `null`, leaves the current tab alone).
  const width = useAssistantSurfaceWidth('automations');
  const selectedStepId = selectedStep?.id ?? null;
  if (selectedStepId !== trackedStepId) {
    setTrackedStepId(selectedStepId);
    if (selectedStep !== null) setActiveTab('node');
  }

  return (
    <aside
      className="relative flex w-[var(--assistant-panel-width)] flex-col border-l border-border"
      style={{ ['--assistant-panel-width' as string]: `${width}px` } as CSSProperties}
    >
      <AssistantResizeHandle surface="automations" />
      <Tabs
        className="min-h-0 flex-1 gap-0"
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DockTab)}
      >
        <div className="border-b border-border p-1">
          <TabsList variant="line" aria-label={t('automationWorkflow.dockTabsLabel')}>
            <TabsTrigger value="chat">{t('automationWorkflow.dockChatTab')}</TabsTrigger>
            <TabsTrigger value="node">{t('automationWorkflow.dockStepTab')}</TabsTrigger>
          </TabsList>
        </div>
        {/* forceMount + hidden (not conditional rendering) keeps the chat
            panel's live session/stream state alive while the Step tab shows —
            unmounting it would drop its SSE connection every tab switch. */}
        <TabsContent
          value="chat"
          forceMount
          hidden={activeTab !== 'chat'}
          className="flex min-h-0 flex-col"
        >
          <AutomationWorkflowChatPanel
            embedded
            workflowId={workflowId}
            workflowName={workflowName}
            onWorkflowChanged={onWorkflowChanged}
          />
        </TabsContent>
        <TabsContent
          value="node"
          forceMount
          hidden={activeTab !== 'node'}
          className="overflow-y-auto"
        >
          <AutomationWorkflowNodeInspector
            key={selectedStep?.id ?? 'none'}
            step={selectedStep}
            busy={stepBusy}
            onSave={onSaveStep}
            onRemove={onRemoveStep}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

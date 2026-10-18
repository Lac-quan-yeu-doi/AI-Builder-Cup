'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { PlantModelChatPanel } from './plant-model-chat-panel';
import { usePlantWorkspace } from './plant-workspace-context';

/**
 * The plant's frame. Its pages, the plant switcher and "Ask Minder" live in
 * the workspace rail while a plant is open (`app/_components/layout/plant-rail`),
 * so this frame only holds the page and, when `?assistant=1`, the assistant
 * column beside it.
 */
export function PlantWorkspaceShell({
  children,
}: {
  readonly siteId: string;
  readonly children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = usePlantWorkspace();
  const chatOpen = searchParams.get('assistant') === '1';

  // Unsaved model edits: the links that leave the page are in the rail now,
  // outside this component, so the guard listens at the document.
  useEffect(() => {
    if (!workspace.dirty) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin || next.pathname === window.location.pathname) {
        return;
      }
      if (!window.confirm(t('plantModel.discardChanges'))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [t, workspace.dirty]);

  const closeChat = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('assistant');
    const query = params.toString();
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
        {chatOpen && workspace.site ? (
          <PlantModelChatPanel
            site={workspace.site}
            draft={workspace.site.draft}
            selectedNodeId={workspace.selectedNodeId}
            selectedRelationshipId={workspace.selectedRelationshipId}
            selectedDashboardId={workspace.selectedDashboardId}
            close={closeChat}
            onModelChanged={() => void workspace.refresh()}
          />
        ) : null}
      </div>
    </div>
  );
}

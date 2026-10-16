'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquareIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';
import { PlantModelChatPanel } from './plant-model-chat-panel';
import { usePlantWorkspace } from './plant-workspace-context';

export function PlantWorkspaceShell({
  siteId,
  children,
}: {
  readonly siteId: string;
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const workspace = usePlantWorkspace();
  const [chatOpen, setChatOpen] = useState(false);
  const encoded = encodeURIComponent(siteId);
  const tabs = [
    { label: 'Overview', href: `/plant-model/${encoded}/overview` },
    { label: 'Model', href: `/plant-model/${encoded}/model` },
    { label: 'Dashboards', href: `/plant-model/${encoded}/dashboards` },
    { label: 'Configure', href: `/plant-model/${encoded}/configure` },
  ];

  function allowNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (workspace.dirty && !window.confirm(t('plantModel.discardChanges'))) {
      event.preventDefault();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-16 flex-wrap items-center gap-4 border-b bg-background px-5">
        <div className="mr-auto min-w-52">
          <Link
            href="/plant-model"
            className="font-semibold hover:underline"
            onClick={allowNavigation}
          >
            {workspace.site?.name ?? 'Plant model'}
          </Link>
          <p className="text-xs text-muted-foreground">Plant operations workspace</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Plant workspace">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Button key={tab.href} asChild variant={active ? 'secondary' : 'ghost'} size="sm">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={active ? undefined : allowNavigation}
                >
                  {tab.label}
                </Link>
              </Button>
            );
          })}
        </nav>
        <Button type="button" variant="outline" size="sm" onClick={() => setChatOpen(true)}>
          <MessageSquareIcon aria-hidden="true" /> Ask Minder
        </Button>
      </header>
      <div className="relative flex min-h-0 flex-1">
        {/* No reserved margin: the panel is a column in this row now, not an
         * overlay floating above it. */}
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
        {chatOpen && workspace.site ? (
          <PlantModelChatPanel
            site={workspace.site}
            draft={workspace.site.draft}
            selectedNodeId={workspace.selectedNodeId}
            selectedRelationshipId={workspace.selectedRelationshipId}
            selectedDashboardId={workspace.selectedDashboardId}
            close={() => setChatOpen(false)}
            onModelChanged={() => void workspace.refresh()}
          />
        ) : null}
      </div>
    </div>
  );
}

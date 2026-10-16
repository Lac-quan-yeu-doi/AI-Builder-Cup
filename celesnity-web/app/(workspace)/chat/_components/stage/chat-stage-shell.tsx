'use client';

import { Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react';
import {
  Columns2Icon,
  EllipsisVerticalIcon,
  Maximize2Icon,
  Minimize2Icon,
  Rows2Icon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/app/_components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

import { KIND } from './pane-kind';
import type { Artifact, Pane, Stage, StageAction } from './chat-stage.types';

interface ChatStageShellProps {
  readonly stage: Stage;
  readonly dispatch: Dispatch<StageAction>;
  /** Plugs in the artifact-specific content without this shell importing any panel component. */
  readonly renderPane: (artifact: Artifact) => ReactNode;
  /**
   * A tab the person chose, as opposed to one the stage activated on its own.
   * The transcript uses it to scroll to where that artifact was made.
   */
  readonly onActivate?: (artifact: Artifact) => void;
}

export function ChatStageShell({ stage, dispatch, renderPane, onActivate }: ChatStageShellProps) {
  if (stage.columns.length === 0) return null;

  const paneCount = stage.columns.reduce((sum, column) => sum + column.panes.length, 0);
  const layout = paneCount > 1 ? 'multi' : 'single';

  if (stage.maximized) {
    const pane = stage.columns
      .flatMap((column) => column.panes)
      .find((entry) => entry.id === stage.maximized);
    if (pane) {
      return (
        <div className="flex h-full min-h-0 flex-col bg-background" data-stage-layout="single">
          <PaneView
            pane={pane}
            focused={false}
            maximized
            framed
            dispatch={dispatch}
            renderPane={renderPane}
            onActivate={onActivate}
          />
        </div>
      );
    }
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        layout === 'multi' ? 'bg-muted/45 p-2' : 'bg-card',
      )}
      data-stage-layout={layout}
    >
      <ResizablePanelGroup
        key={stage.columns.map((column) => column.id).join('|')}
        orientation="horizontal"
        className="h-full min-h-0 gap-0"
      >
        {stage.columns.map((column, ci) => (
          <Fragment key={column.id}>
            {ci > 0 ? <StageResizeHandle /> : null}
            <ResizablePanel id={column.id} minSize={240} className="min-w-0">
              <ResizablePanelGroup
                key={column.panes.map((pane) => pane.id).join('|')}
                orientation="vertical"
                className="h-full min-h-0 gap-0"
              >
                {column.panes.map((pane, pi) => (
                  <Fragment key={pane.id}>
                    {pi > 0 ? <StageResizeHandle /> : null}
                    <ResizablePanel id={pane.id} minSize={150} className="min-h-0">
                      <PaneView
                        pane={pane}
                        focused={paneCount > 1 && stage.focused === pane.id}
                        maximized={false}
                        framed={layout === 'multi'}
                        dispatch={dispatch}
                        renderPane={renderPane}
                        onActivate={onActivate}
                      />
                    </ResizablePanel>
                  </Fragment>
                ))}
              </ResizablePanelGroup>
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    </div>
  );
}

function StageResizeHandle() {
  return (
    <ResizableHandle className="bg-transparent after:hidden aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-full aria-[orientation=vertical]:h-full aria-[orientation=vertical]:w-2" />
  );
}

interface PaneViewProps {
  readonly pane: Pane;
  readonly focused: boolean;
  readonly maximized: boolean;
  readonly framed: boolean;
  readonly dispatch: Dispatch<StageAction>;
  readonly renderPane: (artifact: Artifact) => ReactNode;
  readonly onActivate?: (artifact: Artifact) => void;
}

/**
 * One pane: a header naming what is in front, then, when there is more than
 * one thing to show, a row of buttons to switch between them, then the
 * content. The row is its own line under the header rather than crammed into
 * it, so it reads as the list of charts this conversation has made, in order,
 * and the header keeps room for the title.
 */
function PaneView({
  pane,
  focused,
  maximized,
  framed,
  dispatch,
  renderPane,
  onActivate,
}: PaneViewProps) {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLElement | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const element = headerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setCompact((entry?.contentRect.width ?? element.clientWidth) < 480);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const active = pane.tabs.find((tab) => tab.id === pane.activeId) ?? pane.tabs[0];
  // The reducer's `cleanup` never leaves a pane with zero tabs — this is
  // a defensive fallback, not a reachable render state.
  if (!active) return null;
  const { Icon } = KIND[active.kind];

  return (
    <section
      data-pane-frame={framed ? 'true' : 'false'}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-card',
        framed && 'rounded-xl border shadow-sm',
        /* Which pane the next artifact opens into. Only worth saying when
           there is more than one, and said with the pane's own edge rather
           than `ring-ring`: that token is keyboard focus, and a control inside
           the pane needs its focus ring to still read as the only one. */
        framed && (focused ? 'border-primary/30' : 'border-border'),
      )}
      onPointerDownCapture={() => dispatch({ type: 'focus', paneId: pane.id })}
    >
      <header
        ref={headerRef}
        data-compact={compact ? 'true' : 'false'}
        className={cn(
          'flex min-h-10 items-center gap-2 border-b border-border px-2',
          framed && 'rounded-t-xl bg-card/95',
          compact && 'gap-1 px-1.5',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm font-medium text-foreground">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{active.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('chat.pane.more')}>
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() =>
                  dispatch({ type: 'split', paneId: pane.id, tabId: active.id, dir: 'right' })
                }
              >
                <Columns2Icon />
                {t('chat.pane.splitRight')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  dispatch({ type: 'split', paneId: pane.id, tabId: active.id, dir: 'down' })
                }
              >
                <Rows2Icon />
                {t('chat.pane.splitDown')}
              </DropdownMenuItem>
              {compact ? (
                <DropdownMenuItem onSelect={() => dispatch({ type: 'toggleMax', paneId: pane.id })}>
                  {maximized ? <Minimize2Icon /> : <Maximize2Icon />}
                  {maximized ? t('chat.pane.restore') : t('chat.pane.maximize')}
                </DropdownMenuItem>
              ) : null}
              {pane.tabs.length > 1 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      dispatch({ type: 'closeOthers', paneId: pane.id, tabId: active.id })
                    }
                  >
                    {t('chat.pane.closeOtherTabs')}
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => dispatch({ type: 'closePane', paneId: pane.id })}
              >
                {t('chat.pane.closePane')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!compact && (
            <IconButton
              label={maximized ? t('chat.pane.restore') : t('chat.pane.maximize')}
              Icon={maximized ? Minimize2Icon : Maximize2Icon}
              onClick={() => dispatch({ type: 'toggleMax', paneId: pane.id })}
            />
          )}
          <IconButton
            label={t('chat.pane.closePane')}
            Icon={XIcon}
            onClick={() => dispatch({ type: 'closePane', paneId: pane.id })}
          />
        </div>
      </header>
      {pane.tabs.length > 1 ? (
        <TabStrip pane={pane} dispatch={dispatch} onActivate={onActivate} />
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">{renderPane(active)}</div>
    </section>
  );
}

/**
 * The things open in this pane, as a row of buttons just under its header.
 * Left to right is the order they were opened, which for charts is the order
 * the conversation made them. Pressing one brings it in front and tells the
 * screen, so the transcript can scroll to where that chart was drawn.
 */
function TabStrip({
  pane,
  dispatch,
  onActivate,
}: {
  pane: Pane;
  dispatch: Dispatch<StageAction>;
  onActivate?: (artifact: Artifact) => void;
}) {
  const { t } = useTranslation();
  const activate = (tab: Artifact): void => {
    dispatch({ type: 'activate', paneId: pane.id, tabId: tab.id });
    onActivate?.(tab);
  };
  return (
    <div
      data-slot="pane-tabs"
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-card px-2 py-1.5"
      role="tablist"
      aria-label={t('chat.pane.openInThisPane')}
    >
      {pane.tabs.map((tab, index) => {
        const { Icon } = KIND[tab.kind];
        const selected = tab.id === pane.activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            className={cn(
              'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
            onClick={() => activate(tab)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate(tab);
              }
            }}
          >
            <span className="tabular-nums opacity-70">{index + 1}</span>
            <Icon className="size-3.5" />
            <span className="max-w-40 truncate">{tab.title}</span>
            <button
              type="button"
              aria-label={t('chat.pane.closeTab', { title: tab.title })}
              className={cn(
                'rounded-sm',
                selected
                  ? 'text-primary-foreground/70 hover:text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: 'closeTab', paneId: pane.id, tabId: tab.id });
              }}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function IconButton({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

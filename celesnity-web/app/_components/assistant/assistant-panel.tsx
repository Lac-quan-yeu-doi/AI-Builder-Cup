'use client';

import Link from 'next/link';
import {
  CheckIcon,
  ExternalLinkIcon,
  HistoryIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { ChatComposer } from '@/app/_components/chat/chat-composer';
import { ChatMessageList } from '@/app/_components/chat/chat-message-list';
import type { DisplayMessage } from '@/app/_components/chat/types';
import type { ChatApprovalDecision } from '@/src/entities/models/chat';
import { cn } from '@/app/_components/ui/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { ResolvedCitationViewModel } from '@/src/interface-adapters/presenters/citation.presenter';
import type { ApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import type { ListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import type { RejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';
import type { ResolveCitationsController } from '@/src/interface-adapters/controllers/citations/resolve-citations.controller';

import { AssistantEmptyState } from './assistant-empty-state';
import { AssistantResizeHandle, useAssistantSurfaceWidth } from './assistant-resize-handle';
import type { AssistantScopeChip, AssistantStarter } from './assistant-scope';

/** The four controllers every transcript needs, resolved once by the host. */
export interface AssistantChatControllers {
  readonly resolveCitations: ResolveCitationsController;
  readonly listPendingActions: ListPendingActionsController;
  readonly approvePendingAction: ApprovePendingActionController;
  readonly rejectPendingAction: RejectPendingActionController;
}

export interface AssistantHistoryItem {
  readonly id: string;
  readonly title: string;
}

export interface AssistantPanelProps {
  /** Persistence key for width and open state. One per surface, not per object. */
  readonly surface: string;
  readonly title: string;
  readonly scope?: readonly AssistantScopeChip[];
  readonly onScopeRemove?: (id: string) => void;
  readonly messages: readonly DisplayMessage[];
  readonly isStreaming: boolean;
  readonly error?: string | null;
  readonly onSubmit: (text: string) => void;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly starters?: readonly AssistantStarter[];
  readonly placeholder?: string;
  /** Surface-specific block above the transcript, e.g. the event topic picker. */
  readonly intro?: ReactNode;
  readonly openInChatHref?: string;
  readonly onNewThread?: () => void;
  readonly history?: readonly AssistantHistoryItem[];
  readonly historyLoading?: boolean;
  readonly activeHistoryId?: string | null;
  readonly onHistorySelect?: (id: string) => void;
  readonly onClose?: () => void;
  /**
   * The host supplies the frame — the workflow dock, where the assistant is one
   * tab beside the step inspector. Width, the sheet breakpoint and the header
   * then belong to that host; the panel contributes the conversation.
   */
  readonly embedded?: boolean;
  readonly controllers: AssistantChatControllers;
  readonly onApprovalDecision?: (
    runId: string,
    approvalId: string,
    decision: ChatApprovalDecision,
  ) => Promise<void>;
  readonly onCitationsResolved?: (
    messageId: string,
    citations: Readonly<Record<string, ResolvedCitationViewModel>>,
  ) => void;
  readonly onCitationClick?: (citation: ResolvedCitationViewModel) => void;
}

/**
 * The assistant, docked to whatever surface asked for it.
 *
 * Three screens had grown their own copy of this — three widths (360, 360,
 * 420), three ways of building the frame, two empty states and two error
 * treatments. The host now passes scope and wiring; layout, width, the sheet
 * breakpoint and the chrome all live here.
 *
 * From 1080px it is a resizable column. Below that it is a sheet over the
 * screen, because 400px of panel beside 600px of content leaves neither usable.
 */
export function AssistantPanel({
  surface,
  title,
  scope = [],
  onScopeRemove,
  messages,
  isStreaming,
  error,
  onSubmit,
  emptyTitle,
  emptyDescription,
  starters = [],
  placeholder,
  intro,
  openInChatHref,
  onNewThread,
  history = [],
  historyLoading = false,
  activeHistoryId = null,
  onHistorySelect,
  onClose,
  embedded = false,
  controllers,
  onApprovalDecision,
  onCitationsResolved,
  onCitationClick,
}: AssistantPanelProps): ReactElement {
  const { t } = useTranslation();
  const width = useAssistantSurfaceWidth(surface);
  const messageRowRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (onClose === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const header =
    onNewThread || onHistorySelect || openInChatHref || onClose || !embedded ? (
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <SparklesIcon aria-hidden="true" className="shrink-0 text-muted-foreground" size={16} />
        <h2 className="m-0 min-w-0 flex-1 truncate text-body-sm font-semibold">{title}</h2>
        {onNewThread ? (
          <button
            aria-label={t('assistant.newThread')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onNewThread}
            title={t('assistant.newThread')}
            type="button"
          >
            <PlusIcon size={17} />
          </button>
        ) : null}
        {onHistorySelect ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t('assistant.history')}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t('assistant.history')}
                type="button"
              >
                <HistoryIcon size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>{t('assistant.history')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {historyLoading ? (
                <DropdownMenuItem disabled>{t('state.loading')}</DropdownMenuItem>
              ) : history.length === 0 ? (
                <DropdownMenuItem disabled>{t('assistant.historyEmpty')}</DropdownMenuItem>
              ) : (
                history.map((item) => (
                  <DropdownMenuItem
                    className="min-w-0"
                    key={item.id}
                    onSelect={() => onHistorySelect(item.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.id === activeHistoryId ? <CheckIcon className="text-primary" /> : null}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {openInChatHref ? (
          <Link
            aria-label={t('assistant.openInChat')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            href={openInChatHref}
            title={t('assistant.openInChat')}
          >
            <ExternalLinkIcon size={17} />
          </Link>
        ) : null}
        {onClose ? (
          <button
            aria-label={t('assistant.close')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClose}
            title={t('assistant.close')}
            type="button"
          >
            <XIcon size={17} />
          </button>
        ) : null}
      </div>
    ) : null;

  const body = (
    <>
      {header}

      {scope.length > 0 ? (
        <div
          aria-label={t('assistant.scopeLabel')}
          className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2"
          role="group"
        >
          {scope.map((chip) => (
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-micro shadow-hairline"
              key={chip.id}
            >
              <span className="shrink-0 text-muted-foreground">{chip.kind}</span>
              <span className="min-w-0 truncate font-medium text-foreground">{chip.value}</span>
              {chip.removable && onScopeRemove ? (
                <button
                  aria-label={t('assistant.scopeRemove', { value: chip.value })}
                  className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => onScopeRemove(chip.id)}
                  type="button"
                >
                  <XIcon size={13} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {intro}

      {messages.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AssistantEmptyState
            description={emptyDescription}
            onSelect={onSubmit}
            starters={starters}
            title={emptyTitle}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-3 py-3">
          <ChatMessageList
            approvePendingAction={controllers.approvePendingAction}
            isStreaming={isStreaming}
            listPendingActions={controllers.listPendingActions}
            messageRowRefs={messageRowRefs}
            messages={messages}
            onCitationClick={(citation) => onCitationClick?.(citation)}
            onCitationsResolved={(messageId, citations) =>
              onCitationsResolved?.(messageId, citations)
            }
            onInspectRun={() => undefined}
            onApprovalDecision={onApprovalDecision}
            onSuggestionSelect={onSubmit}
            rejectPendingAction={controllers.rejectPendingAction}
            resolveCitations={controllers.resolveCitations}
          />
        </div>
      )}

      {error ? (
        <p
          className="m-0 shrink-0 border-t border-destructive/30 bg-destructive/10 px-4 py-2.5 text-caption leading-relaxed text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="shrink-0 border-t border-border px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <ChatComposer
          compact
          disabled={isStreaming}
          onSubmit={onSubmit}
          {...(placeholder === undefined ? {} : { placeholder })}
        />
      </div>
    </>
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col">{body}</div>;
  }

  return (
    <aside
      aria-label={title}
      className={cn(
        'fixed inset-0 z-50 flex min-h-0 w-full flex-col overflow-hidden bg-sidebar',
        // `relative` rather than `static`: the drag edge is absolutely
        // positioned against this element.
        'min-[1080px]:relative min-[1080px]:inset-auto min-[1080px]:z-auto min-[1080px]:h-full min-[1080px]:w-[var(--assistant-panel-width)] min-[1080px]:shrink-0 min-[1080px]:border-l min-[1080px]:border-border',
      )}
      style={{ ['--assistant-panel-width' as string]: `${width}px` } as CSSProperties}
    >
      <AssistantResizeHandle surface={surface} />
      {body}
    </aside>
  );
}

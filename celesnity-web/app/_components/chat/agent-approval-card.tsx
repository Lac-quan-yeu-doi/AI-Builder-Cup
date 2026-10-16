'use client';

import { useState } from 'react';

import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { ChatApprovalDecision, ChatPendingApproval } from '@/src/entities/models/chat';
import { toolLabelKey } from './activity-display';

interface AgentApprovalCardProps {
  readonly approval: ChatPendingApproval;
  readonly onDecide: (decision: ChatApprovalDecision) => Promise<void>;
}

/** Inline consent card for a minder-agent tool call paused by governance. */
export function AgentApprovalCard({ approval, onDecide }: AgentApprovalCardProps) {
  const { t } = useTranslation();
  const [deciding, setDeciding] = useState<ChatApprovalDecision | null>(null);
  const [error, setError] = useState(false);
  const expired = new Date() >= new Date(approval.expiresAt);

  const decide = async (decision: ChatApprovalDecision) => {
    setDeciding(decision);
    setError(false);
    try {
      await onDecide(decision);
    } catch {
      setError(true);
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div
      role="group"
      aria-label={t('chat.agentApproval.label')}
      className="w-full max-w-[56rem] rounded-2xl border border-status-warning/30 bg-status-warning-light px-3 py-3 text-body-sm min-[481px]:px-4 min-[481px]:py-4"
    >
      <p className="m-0 text-micro font-medium tracking-[0.08em] text-status-warning-dark uppercase">
        {expired ? t('chat.agentApproval.expired') : t('chat.agentApproval.waiting')}
      </p>
      <p className="m-0 mt-2 font-medium text-foreground">{t(toolLabelKey(approval.action))}</p>
      <p className="m-0 mt-1 leading-relaxed text-muted-foreground">
        {t('chat.agentApproval.description')}
      </p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">{t('chat.agentApproval.details')}</summary>
        <p className="m-0 mt-1 whitespace-pre-wrap break-words">{approval.preview}</p>
      </details>
      {!expired && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            data-tutorial-target="chat-approval-approve"
            type="button"
            size="sm"
            disabled={deciding !== null}
            aria-busy={deciding === 'approved'}
            onClick={() => void decide('approved')}
          >
            {t('chat.agentApproval.approve')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={deciding !== null}
            aria-busy={deciding === 'denied'}
            onClick={() => void decide('denied')}
          >
            {t('chat.agentApproval.deny')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 mt-2 text-xs text-destructive">
          {t('chat.agentApproval.error')}
        </p>
      )}
    </div>
  );
}

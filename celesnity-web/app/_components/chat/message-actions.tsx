'use client';

import { useState } from 'react';

import { IconButton } from '@/app/_components/ui/icon-button';
import {
  CheckIcon,
  CopyIcon,
  RefreshIcon,
  ShareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@/app/_components/ui/icons';
import { useTranslation } from '@/app/_i18n/use-translation';
import { stripSuggestionTags } from '@/src/entities/models/suggestion';

import { parseSystemReminderContent } from './system-reminder';

interface MessageActionsProps {
  /** The reply's raw content; what gets copied is the prose the reader saw. */
  readonly content: string;
  /** Asks for the answer again. Omitted where that makes no sense (an older reply). */
  readonly onRegenerate?: () => void;
}

/**
 * The row of glyphs under a finished answer — copy, regenerate, share, good,
 * poor — in the order ChatGPT's action row uses, so the eye finds them where
 * it expects. Share and the two ratings have nowhere to go yet and say so in
 * their label; they hold their place so the row does not change shape when
 * they arrive.
 */
export function MessageActions({ content, onRegenerate }: MessageActionsProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        stripSuggestionTags(parseSystemReminderContent(content).content, false),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked (permissions, insecure context); the
      // answer is still selectable.
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        label={copied ? t('chat.message.copied') : t('chat.message.copy')}
        size="sm"
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </IconButton>
      <IconButton
        label={t('chat.message.regenerate')}
        size="sm"
        disabled={onRegenerate === undefined}
        onClick={onRegenerate}
      >
        <RefreshIcon />
      </IconButton>
      <IconButton label={t('chat.message.share')} size="sm" disabled>
        <ShareIcon />
      </IconButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <IconButton label={t('chat.message.like')} size="sm" disabled>
        <ThumbsUpIcon />
      </IconButton>
      <IconButton label={t('chat.message.dislike')} size="sm" disabled>
        <ThumbsDownIcon />
      </IconButton>
    </div>
  );
}

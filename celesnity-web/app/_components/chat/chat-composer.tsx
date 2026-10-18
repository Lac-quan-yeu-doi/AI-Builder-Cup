'use client';

import type { ReactNode } from 'react';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { ArrowUpIcon, PlusIcon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { cn } from '@/app/_components/ui/utils';
import { Button } from '@/app/_components/ui/button';
import {
  Attachment,
  AttachmentActions,
  AttachmentAction,
  AttachmentContent,
  AttachmentGroup,
  AttachmentTitle,
} from '@/app/_components/ui/attachment';
import { CloseIcon } from '@/app/_components/ui/icons';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/app/_components/ui/input-group';
import type { ChatAttachment } from '@/src/entities/models/chat-attachment';

/**
 * A workspace surface reachable from the composer.
 *
 * The design system's sixth rule puts the controls in the composer bar rather
 * than a header, and this is what the chat screen had in a floating row of
 * seven icon buttons: the charts library, automations, the run workspace, the
 * agent's own settings. They belong with the message because they are what a
 * message can be about.
 */
export interface ComposerTool {
  readonly id: string;
  /** Already translated by the caller, which owns the surface being opened. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
}

export interface MentionSource {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly color: string;
}

interface ChatComposerProps {
  /** Compact mode for the sidebar follow-up composer. */
  readonly compact?: boolean;
  readonly disabled?: boolean;
  /** Initial draft shown before the member edits or sends the message. */
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly onSubmit: (prompt: string) => void;
  /** Controls that belong with the prompt — the database it asks about. */
  readonly toolbar?: ReactNode;
  /** Manually attached resources (e.g. a chart, via `ChartSidebar`'s attach button) shown as removable chips above the input. */
  readonly attachments?: readonly ChatAttachment[];
  readonly onRemoveAttachment?: (id: string) => void;
  /** Called when the user attaches a file via the paperclip button. */
  readonly onFileAttach?: (file: File) => void;
  /** Allows attachment selection to be gated independently from prompt entry. */
  readonly fileAttachmentDisabled?: boolean;
  readonly fileAccept?: string;
  /** Workspace panels this composer can open. Empty on surfaces with no stage. */
  readonly tools?: readonly ComposerTool[];
  /** Sources available for @-mention (e.g. connected plugins). */
  readonly mentionSources?: readonly MentionSource[];
  readonly onMentionAdd?: (source: MentionSource) => void;
}

const SLASH_COMMANDS = [
  {
    id: 'schema',
    labelKey: 'chat.suggestion.schema' as const,
    descriptionKey: 'chat.suggestion.schema.desc' as const,
    prompt: 'Explore my data catalog and summarize the available tables.',
  },
  {
    id: 'query',
    labelKey: 'chat.suggestion.query' as const,
    descriptionKey: 'chat.suggestion.query.desc' as const,
    prompt: 'Help me write a read-only SQL query for my data.',
  },
  {
    id: 'pipeline',
    labelKey: 'chat.suggestion.pipeline' as const,
    descriptionKey: 'chat.suggestion.pipeline.desc' as const,
    prompt: 'Design a data pipeline from my source to its destination.',
  },
  {
    id: 'chart',
    labelKey: 'chat.suggestion.chart' as const,
    descriptionKey: 'chat.suggestion.chart.desc' as const,
    prompt: 'Create charts and dashboards from my query results.',
  },
] as const;

export function ChatComposer({
  compact,
  disabled,
  initialValue = '',
  placeholder,
  onSubmit,
  toolbar,
  attachments,
  onRemoveAttachment,
  onFileAttach,
  fileAttachmentDisabled,
  fileAccept = 'application/pdf',
  tools,
  mentionSources,
  onMentionAdd,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState(initialValue);
  const [slashOpen, setSlashOpen] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionAnchor, setMentionAnchor] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (addMenuRef.current?.contains(target) || addTriggerRef.current?.contains(target)) return;
      setAddMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [addMenuOpen]);

  const handleAddMenuKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setAddMenuOpen(false);
    addTriggerRef.current?.focus();
  }, []);

  const filteredSlashCommands = useMemo(() => {
    if (!value.startsWith('/')) return [];
    const query = value.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter((command) => {
      const label = t(command.labelKey).toLowerCase();
      return command.id.includes(query) || label.includes(query);
    });
  }, [t, value]);

  const mentionQuery = useMemo(() => {
    if (!mentionOpen || mentionAnchor < 0) return '';
    return value.slice(mentionAnchor + 1).toLowerCase();
  }, [mentionOpen, mentionAnchor, value]);

  const filteredMentions = useMemo(() => {
    if (!mentionOpen || !mentionSources) return [];
    return mentionSources.filter((s) => s.label.toLowerCase().includes(mentionQuery));
  }, [mentionOpen, mentionSources, mentionQuery]);

  const mentionPattern = useMemo(() => {
    if (!mentionSources || mentionSources.length === 0) return null;
    const escaped = mentionSources
      .map((s) => s.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    return new RegExp(`@(?:${escaped.join('|')})(?=\\s|$)`, 'g');
  }, [mentionSources]);

  const hasMentionInText = useMemo(() => {
    if (!mentionPattern) return false;
    mentionPattern.lastIndex = 0;
    return mentionPattern.test(value);
  }, [mentionPattern, value]);

  const highlightedContent = useMemo((): ReactNode => {
    if (!hasMentionInText || !mentionPattern || !mentionSources) return value;
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    mentionPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = mentionPattern.exec(value)) !== null) {
      if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
      const label = match[0].slice(1);
      const source = mentionSources.find((s) => s.label === label);
      parts.push(
        <span
          key={key++}
          className="rounded-sm"
          style={{
            backgroundColor: source ? `${source.color}18` : undefined,
            color: source?.color,
          }}
        >
          {match[0]}
        </span>,
      );
      lastIndex = mentionPattern.lastIndex;
    }
    if (lastIndex < value.length) parts.push(value.slice(lastIndex));
    return parts;
  }, [hasMentionInText, mentionPattern, mentionSources, value]);

  useEffect(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    const sync = () => {
      mirror.style.width = `${ta.offsetWidth}px`;
      mirror.style.height = `${ta.offsetHeight}px`;
      mirror.style.top = `${ta.offsetTop}px`;
      mirror.style.left = `${ta.offsetLeft}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(ta);
    return () => ro.disconnect();
  }, [value, hasMentionInText]);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Empty again: drop the inline height so the field returns to the size
    // its class gives it, instead of the height of whatever was just sent.
    if (textarea.value === '') {
      textarea.style.height = '';
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 120 : 150)}px`;
  }, [compact]);

  /*
   * Measured after the value has reached the DOM. Sending used to call
   * `resizeTextarea` right after `setValue('')`, which measured the field
   * while the pasted paragraph was still in it, so the box kept that height
   * with nothing inside. The effect runs once the new value is committed;
   * the mount is skipped so the field keeps its designed size until typed in.
   */
  const measuredValue = useRef(value);
  useLayoutEffect(() => {
    if (measuredValue.current === value) return;
    measuredValue.current = value;
    resizeTextarea();
  }, [resizeTextarea, value]);

  const submit = useCallback(() => {
    const prompt = value.trim();
    if (!prompt) return;
    onSubmit(prompt);
    setValue('');
    setSlashOpen(false);
    setMentionOpen(false);
  }, [onSubmit, value]);

  const selectMention = useCallback(
    (index: number) => {
      const source = filteredMentions[index];
      if (!source) return;
      const before = value.slice(0, mentionAnchor);
      const afterQuery = value.slice(mentionAnchor + 1 + mentionQuery.length);
      const trailing = afterQuery.length === 0 || !afterQuery.startsWith(' ') ? ' ' : '';
      const inserted = '@' + source.label + trailing;
      setValue(before + inserted + afterQuery);
      setMentionOpen(false);
      setMentionAnchor(-1);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          const pos = before.length + inserted.length;
          ta.focus();
          ta.setSelectionRange(pos, pos);
        }
        resizeTextarea();
      });
    },
    [filteredMentions, mentionAnchor, mentionQuery.length, resizeTextarea, value],
  );

  const selectSlashCommand = useCallback(
    (index: number) => {
      const command = filteredSlashCommands[index];
      if (!command) return;
      setValue(command.prompt);
      setSlashOpen(false);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        resizeTextarea();
      });
    },
    [filteredSlashCommands, resizeTextarea],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionOpen && filteredMentions.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedMentionIndex((i) => (i + 1) % filteredMentions.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedMentionIndex(
            (i) => (i - 1 + filteredMentions.length) % filteredMentions.length,
          );
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          selectMention(selectedMentionIndex);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setMentionOpen(false);
          return;
        }
      }
      if (slashOpen && filteredSlashCommands.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedSlashIndex((index) => (index + 1) % filteredSlashCommands.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedSlashIndex(
            (index) => (index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
          );
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          selectSlashCommand(selectedSlashIndex);
          return;
        }
      }
      if (event.key === 'Escape' && slashOpen) {
        event.preventDefault();
        setSlashOpen(false);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    },
    [
      filteredMentions.length,
      filteredSlashCommands.length,
      mentionOpen,
      selectMention,
      selectSlashCommand,
      selectedMentionIndex,
      selectedSlashIndex,
      slashOpen,
      submit,
    ],
  );

  const handleInput = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setValue(nextValue);
      const isSlashQuery = nextValue.startsWith('/') && !nextValue.includes(' ');
      setSlashOpen(isSlashQuery);
      setSelectedSlashIndex(0);

      if (mentionSources && mentionSources.length > 0) {
        const cursor = event.target.selectionStart ?? nextValue.length;
        const before = nextValue.slice(0, cursor);
        const atMatch = before.match(/(^|[\s])@([^\s]*)$/);
        if (atMatch) {
          const anchor = before.lastIndexOf('@');
          setMentionOpen(true);
          setMentionAnchor(anchor);
          setSelectedMentionIndex(0);
        } else {
          setMentionOpen(false);
        }
      }

      resizeTextarea();
    },
    [mentionSources, resizeTextarea],
  );

  const handleFormSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  /*
   * One add menu, used by both composers.
   *
   * There were two copies of this markup, one per branch, and they had already
   * drifted: the workspace panels reached only the wide composer, so the
   * follow-up composer in a running conversation could not open any of them.
   */
  const addMenu = (
    <div className="relative">
      {/* Not disabled while a reply streams: the menu also opens workspace
          panels, which are navigation rather than message content. The one item
          that does attach to the message keeps its own guard. */}
      <InputGroupButton
        data-tutorial-target="chat-file-attach"
        ref={addTriggerRef}
        size="icon-sm"
        aria-label={t('chat.composer.addToMessage')}
        aria-controls="chat-composer-add-menu"
        aria-expanded={addMenuOpen}
        aria-haspopup="menu"
        onClick={() => setAddMenuOpen((open) => !open)}
      >
        <PlusIcon />
      </InputGroupButton>
      {addMenuOpen && (
        <div
          id="chat-composer-add-menu"
          ref={addMenuRef}
          onKeyDown={handleAddMenuKeyDown}
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <Button
            role="menuitem"
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={!onFileAttach || (fileAttachmentDisabled ?? disabled === true)}
            onClick={() => {
              setAddMenuOpen(false);
              fileInputRef.current?.click();
            }}
          >
            {t('chat.composer.attachFile')}
          </Button>

          {tools && tools.length > 0 && (
            <>
              <div aria-hidden="true" className="my-1 h-px bg-border" role="presentation" />
              <p className="px-2 py-1 text-micro tracking-wide text-muted-foreground uppercase">
                {t('chat.composer.tools')}
              </p>
              {tools.map((tool) => (
                <Button
                  key={tool.id}
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setAddMenuOpen(false);
                    tool.onSelect();
                  }}
                >
                  {tool.icon}
                  {tool.label}
                </Button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );

  const mentionDropdown = mentionOpen && filteredMentions.length > 0 && (
    <div
      role="listbox"
      aria-label="Mentions"
      className="absolute inset-x-2 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
    >
      {filteredMentions.map((source, index) => (
        <button
          key={source.id}
          type="button"
          role="option"
          aria-selected={index === selectedMentionIndex}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
            index === selectedMentionIndex ? 'bg-accent' : 'hover:bg-accent/60',
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectMention(index)}
        >
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${source.color}18` }}
          >
            {source.icon}
          </span>
          <span className="text-caption font-medium text-foreground">{source.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <form
      data-tutorial-target="chat-composer"
      className={cn(
        'relative w-full rounded-3xl border border-border bg-card p-2.5 text-left transition-colors focus-within:border-primary/50 sm:rounded-4xl sm:p-3',
        compact ? 'shadow-300' : 'shadow-400',
      )}
      onSubmit={handleFormSubmit}
    >
      {(toolbar || (attachments && attachments.some((a) => a.type !== 'mention'))) && (
        <div className="mb-2 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-0.5">
          {toolbar && <div className="shrink-0">{toolbar}</div>}
          {attachments && attachments.some((a) => a.type !== 'mention') && (
            <AttachmentGroup className="min-w-0 gap-1.5 overflow-visible py-0">
              {attachments
                .filter((a) => a.type !== 'mention')
                .map((attachment) => (
                  <Attachment key={attachment.id} size="xs" className="rounded-full bg-muted">
                    <AttachmentContent className="max-w-40 px-2 py-1">
                      <AttachmentTitle>{attachment.title}</AttachmentTitle>
                    </AttachmentContent>
                    {onRemoveAttachment && (
                      <AttachmentActions className="pr-1">
                        <AttachmentAction
                          aria-label={t('chat.composer.removeAttachment', {
                            title: attachment.title,
                          })}
                          onClick={() => onRemoveAttachment(attachment.id)}
                        >
                          <CloseIcon size={13} />
                        </AttachmentAction>
                      </AttachmentActions>
                    )}
                  </Attachment>
                ))}
            </AttachmentGroup>
          )}
        </div>
      )}

      {/* `min-h-10` belongs to the row below, not to the field inside it.
          Forcing the textarea to 40px while its line box is 21.7px left all the
          slack under the text, so the placeholder sat above the `+` beside it.
          Sized to its own line, the field is symmetric and `items-center` has
          something honest to centre. */}
      {compact ? (
        <div className="relative flex min-h-10 items-center gap-1.5 rounded-xl px-1 py-0.5">
          {mentionDropdown}
          <div className="shrink-0">{addMenu}</div>
          <div className="relative min-h-0 flex-1">
            {hasMentionInText && (
              <div
                ref={mirrorRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-2 text-body-md leading-[1.55]"
              >
                {highlightedContent}
              </div>
            )}
            <InputGroupTextarea
              ref={textareaRef}
              rows={1}
              value={value}
              className={cn(
                'min-h-0 w-full resize-none border-0 bg-transparent px-2 py-2 text-body-md leading-[1.55] shadow-none md:text-body-md focus-visible:ring-0',
                hasMentionInText && 'relative z-[1]',
              )}
              style={
                hasMentionInText
                  ? { color: 'transparent', caretColor: 'var(--color-foreground)' }
                  : undefined
              }
              disabled={disabled}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onScroll={() => {
                if (mirrorRef.current && textareaRef.current)
                  mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
              }}
              placeholder={placeholder ?? t('chat.placeholder')}
              aria-label={t('chat.composer.followUpLabel')}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={fileAccept}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && onFileAttach) onFileAttach(file);
              event.target.value = '';
            }}
          />
          <InputGroupButton
            type="submit"
            size="icon-sm"
            className={cn(
              'shrink-0 rounded-full transition-colors',
              value.trim() === ''
                ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            disabled={disabled}
            aria-busy={disabled}
            aria-label={t('chat.composer.sendPrompt')}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </div>
      ) : (
        <div className="relative">
          <InputGroup
            data-disabled={disabled || undefined}
            className="min-h-0 h-auto rounded-2xl border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0"
          >
            {hasMentionInText && (
              <div
                ref={mirrorRef}
                aria-hidden="true"
                className="pointer-events-none absolute z-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-2 text-body-md leading-[1.55]"
              >
                {highlightedContent}
              </div>
            )}
            <InputGroupTextarea
              ref={textareaRef}
              value={value}
              className={cn(
                'block min-h-0 w-full px-2 py-2 text-body-md leading-[1.55] focus-visible:ring-0 md:text-body-md',
                compact ? 'h-[58px] max-h-[120px]' : 'h-[72px] max-h-[150px]',
                hasMentionInText && 'relative z-[1]',
              )}
              style={
                hasMentionInText
                  ? { color: 'transparent', caretColor: 'var(--color-foreground)' }
                  : undefined
              }
              disabled={disabled}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onScroll={() => {
                if (mirrorRef.current && textareaRef.current)
                  mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
              }}
              placeholder={placeholder ?? t('chat.placeholder')}
              aria-label={
                compact ? t('chat.composer.followUpLabel') : t('chat.landing.promptLabel')
              }
            />
            {slashOpen && filteredSlashCommands.length > 0 && (
              <div
                role="listbox"
                aria-label={t('chat.composer.slashCommands')}
                className="absolute inset-x-2 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
              >
                {filteredSlashCommands.map((command, index) => (
                  <button
                    key={command.id}
                    id={`chat-slash-command-${command.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === selectedSlashIndex}
                    className={cn(
                      'flex w-full cursor-pointer flex-col items-start rounded-lg px-3 py-2 text-left transition-colors',
                      index === selectedSlashIndex ? 'bg-accent' : 'hover:bg-accent/60',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSlashCommand(index)}
                  >
                    <span className="text-caption font-medium text-foreground">
                      {t(command.labelKey)}
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-caption text-muted-foreground">
                      {t(command.descriptionKey)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {mentionDropdown}
            <InputGroupAddon
              align="block-end"
              className="border-t border-border/70 px-2 pb-1 pt-1.5"
            >
              <div className="flex w-full items-center gap-1.5">
                {addMenu}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={fileAccept}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && onFileAttach) onFileAttach(file);
                    event.target.value = '';
                  }}
                />
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  className="ml-auto rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  disabled={disabled}
                  aria-busy={disabled}
                  aria-label={t('chat.composer.sendPrompt')}
                >
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M3.5 10h13M11 4.5 16.5 10 11 15.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          </InputGroup>
        </div>
      )}
    </form>
  );
}

'use client';

import {
  Fragment,
  createContext,
  isValidElement,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { splitBlocks } from './markdown-split';
import { textAnchorPosition } from './text-anchor';
import { rehypeWords } from './rehype-words';

import { IconButton } from '@/app/_components/ui/icon-button';
import { CheckIcon, ChevronDownIcon, CopyIcon } from '@/app/_components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';
import { useTranslation } from '@/app/_i18n/use-translation';
import {
  citationKey,
  extractCitationRefs,
  parseCitationHref,
  rewriteCitationTags,
} from '@/src/entities/models/citation';
import type { ResolvedCitationViewModel } from '@/src/interface-adapters/presenters/citation.presenter';

/** A small circular numbered marker for a citation — built from a styled
 * span rather than a Unicode "circled digit" glyph (①②③…), whose glyph
 * coverage past ⑩ is inconsistent and whose look varies across fonts. */
function NumberBadge({
  index,
  decorative = false,
}: {
  readonly index: number;
  readonly decorative?: boolean;
}) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-current text-micro leading-none font-medium"
    >
      {index}
    </span>
  );
}

interface ChatMarkdownProps {
  readonly content: string;
  /** Resolved citations for this message, keyed by `citationKey()`. Omit while resolution hasn't finished. */
  readonly resolvedCitations?: Readonly<Record<string, ResolvedCitationViewModel>>;
  /**
   * A chart citation click focuses that chart in `ChartSidebar` (see
   * `chat-screen.tsx`'s `focusChartRequest` wiring). Document citations have
   * no navigation target yet — the tooltip alone carries the provenance
   * value for those. Omit entirely for a read-only render (e.g. a shared
   * transcript export) where clicking shouldn't do anything.
   */
  readonly onCitationClick?: (citation: ResolvedCitationViewModel) => void;
  /**
   * Fade in each word from this source offset on, as it streams; words before
   * it have settled and render plain. Omit for a message that has settled
   * entirely, which renders as plain prose with no per-word markup.
   */
  readonly animateFrom?: number;
  /**
   * Cards placed inside the prose. Each lands just after the block that ends
   * the sentence its `anchor` names (the reply's tail when the tool was
   * called), at the very top for an empty anchor, and after all the prose when
   * the anchor is missing or has not streamed in yet. See `text-anchor.ts`.
   */
  readonly inserts?: readonly MarkdownInsert[];
}

export interface MarkdownInsert {
  /** Must change whenever the node's rendering changes; the memo compares keys, not nodes. */
  readonly key: string;
  readonly anchor?: string;
  readonly offset?: number;
  readonly node: ReactNode;
}

/** The offset `Word` reads `animateFrom` from — a prop would need a new
 * component per render, and a new component type remounts every word and
 * restarts its fade. */
const AnimateFromContext = createContext(0);

/** One streamed word (see `rehypeWords`), fading in unless it has settled. */
function Word({ children, ...props }: { readonly children?: ReactNode }) {
  const animateFrom = useContext(AnimateFromContext);
  const token = Number((props as Record<string, unknown>)['data-token']);
  return (
    <span
      className={
        Number.isFinite(token) && token >= animateFrom ? 'motion-safe:animate-token-in' : undefined
      }
    >
      {children}
    </span>
  );
}

// react-markdown's default URL sanitizer only allows a small protocol
// allowlist (http/https/mailto/tel/relative) and silently empties anything
// else — including our `citation://` scheme. Let that one through verbatim;
// everything else still gets the default sanitization.
function citationAwareUrlTransform(url: string): string {
  return url.startsWith('citation://') ? url : defaultUrlTransform(url);
}

const LIVE_REHYPE_PLUGINS = [rehypeWords];
const NO_REHYPE_PLUGINS: never[] = [];

/**
 * One block of a message (see `splitBlocks`), re-parsed only when its text or
 * fade boundary changes. Live — `animateFrom` given — it renders one span per
 * word (see `rehypeWords`), with the boundary counted from the block's own
 * start; settled, it renders plain. One component for both, so a block that
 * settles re-renders in place instead of being replaced.
 */
const MarkdownBlock = memo(function MarkdownBlock({
  content,
  animateFrom,
  components,
}: {
  readonly content: string;
  readonly animateFrom?: number;
  readonly components: Components;
}) {
  return (
    <AnimateFromContext.Provider value={animateFrom ?? 0}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={animateFrom === undefined ? NO_REHYPE_PLUGINS : LIVE_REHYPE_PLUGINS}
        components={components}
        urlTransform={citationAwareUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </AnimateFromContext.Provider>
  );
});

/** Flattens a code element's children into the plain text the copy button
 * writes to the clipboard — fenced code blocks are always plain text nodes,
 * never nested markup, so a straightforward recursive join is exact. */
function flattenToText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenToText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return flattenToText(node.props.children);
  return '';
}

function headingClass(level: 1 | 2 | 3 | 4 | 5 | 6): string {
  // Scaled down from a document's h1–h6 to sit inside a reply set in
  // `text-body-md` — a full-size h1 would dwarf the message around it. Two
  // steps above the prose, then one, then the prose's own size in a heavier
  // weight, the way ChatGPT and AI Hay set headings inside an answer.
  switch (level) {
    case 1:
      return 'mt-4 mb-2 text-title font-semibold first:mt-0';
    case 2:
      return 'mt-3.5 mb-1.5 text-body-lg font-semibold first:mt-0';
    case 3:
      return 'mt-3 mb-1 text-body-md font-semibold first:mt-0';
    default:
      return 'mt-2.5 mb-1 text-body-md font-medium text-foreground first:mt-0';
  }
}

function CodeBlock({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const codeElement = isValidElement<{ className?: string; children?: ReactNode }>(children)
    ? children
    : null;
  const language = /language-(\S+)/.exec(codeElement?.props.className ?? '')?.[1] ?? null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(flattenToText(codeElement?.props.children));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked (permissions, insecure context); the
      // code block is still fully readable/selectable without it.
    }
  };

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-border bg-muted last:mb-0">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-1">
        <span className="font-mono text-caption text-muted-foreground">{language ?? 'text'}</span>
        <IconButton
          label={copied ? t('chat.code.copied') : t('chat.code.copy')}
          size="xs"
          onClick={() => void handleCopy()}
        >
          {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
        </IconButton>
      </div>
      <pre className="overflow-x-auto p-3">{children}</pre>
    </div>
  );
}

const staticComponents: Components = {
  // Only `rehypeWords` puts spans in the tree, one per word.
  span: Word,
  h1: ({ children }) => <h1 className={headingClass(1)}>{children}</h1>,
  h2: ({ children }) => <h2 className={headingClass(2)}>{children}</h2>,
  h3: ({ children }) => <h3 className={headingClass(3)}>{children}</h3>,
  h4: ({ children }) => <h4 className={headingClass(4)}>{children}</h4>,
  h5: ({ children }) => <h5 className={headingClass(5)}>{children}</h5>,
  h6: ({ children }) => <h6 className={headingClass(6)}>{children}</h6>,
  p: ({ children }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
  li: ({ className, children }) => (
    // GFM task-list items (`- [ ] foo`) carry a `task-list-item` class from
    // remark-gfm; drop the bullet/number marker for those since the
    // checkbox itself is the marker.
    <li className={className?.includes('task-list-item') ? 'mb-0.5 list-none' : 'mb-0.5'}>
      {children}
    </li>
  ),
  input: ({ type, checked, disabled }) =>
    type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled ?? true}
        readOnly
        className="mr-1.5 -ml-5 accent-primary align-middle"
      />
    ) : null,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <code className={`font-mono text-caption ${className ?? ''}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-caption text-foreground"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto rounded-lg border border-border last:mb-0">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tbody: ({ children }) => <tbody className="[&>tr:nth-child(even)]:bg-muted/40">{children}</tbody>,
  th: ({ children }) => (
    <th className="border-b border-border px-2.5 py-1.5 font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-border px-2.5 py-1.5">{children}</td>,
  img: ({ src, alt }) =>
    typeof src === 'string' ? (
      // eslint-disable-next-line @next/next/no-img-element -- remote/unknown-dimension markdown images aren't a fit for next/image's static optimization.
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className="mb-2 max-w-full rounded-lg border border-border last:mb-0"
      />
    ) : null,
  hr: () => <hr className="my-3 border-border" />,
};

/**
 * Re-rendered only when its text, citations or fade boundary change. Every
 * streamed chunk re-renders the whole transcript above it, and re-parsing
 * every earlier message's markdown on each one is what made a long
 * conversation stutter while a reply streamed. The click handler is read
 * through a ref so a fresh function from the parent neither re-renders this
 * nor goes stale.
 */
/** Inserts compare by key and pin, never by node: a card whose look changes must change its key. */
function insertsSignature(inserts: readonly MarkdownInsert[] | undefined): string {
  return (inserts ?? [])
    .map((insert) => `${insert.key}@${insert.anchor ?? ''}#${insert.offset ?? ''}`)
    .join('\n');
}

function chatMarkdownPropsEqual(previous: ChatMarkdownProps, next: ChatMarkdownProps): boolean {
  return (
    previous.content === next.content &&
    previous.resolvedCitations === next.resolvedCitations &&
    previous.animateFrom === next.animateFrom &&
    (previous.onCitationClick === undefined) === (next.onCitationClick === undefined) &&
    insertsSignature(previous.inserts) === insertsSignature(next.inserts)
  );
}

export const ChatMarkdown = memo(function ChatMarkdown({
  content,
  resolvedCitations,
  onCitationClick,
  animateFrom,
  inserts,
}: ChatMarkdownProps) {
  const { t } = useTranslation();
  const rewritten = useMemo(() => rewriteCitationTags(content), [content]);

  // Where each insert lands in the rewritten text; `Infinity` is "after the
  // prose", which is also where an anchor that has not streamed in yet waits.
  const placed = useMemo(
    () =>
      (inserts ?? []).map((insert) => {
        if (insert.anchor === undefined) return { ...insert, at: Number.POSITIVE_INFINITY };
        const at = textAnchorPosition(rewritten, insert.anchor, insert.offset);
        return { ...insert, at: at === -1 ? Number.POSITIVE_INFINITY : at };
      }),
    [inserts, rewritten],
  );

  const onCitationClickRef = useRef(onCitationClick);
  useEffect(() => {
    onCitationClickRef.current = onCitationClick;
  });
  // Only whether there is a handler matters; the ref carries the latest one.
  const hasCitationClick = onCitationClick !== undefined;
  const clickCitation = useMemo(
    () =>
      hasCitationClick
        ? (citation: ResolvedCitationViewModel) => onCitationClickRef.current?.(citation)
        : undefined,
    [hasCitationClick],
  );

  // Numbers citations in document order, first-occurrence-wins, so the same
  // chart/document cited twice keeps one badge. Keyed on the citations
  // themselves rather than the text, so a streaming tick that adds prose but
  // no citation leaves `components` — and with it the memoised head — alone.
  const citationHrefs = useMemo(
    () =>
      [...rewritten.matchAll(/\[cite\]\((citation:\/\/[^)]+)\)/g)]
        .map((match) => match[1])
        .filter((href): href is string => href !== undefined)
        .join('\n'),
    [rewritten],
  );
  const citationOrder = useMemo(() => {
    const order = new Map<string, number>();
    if (citationHrefs === '') return order;
    for (const href of citationHrefs.split('\n'))
      if (!order.has(href)) order.set(href, order.size + 1);
    return order;
  }, [citationHrefs]);

  const components = useMemo<Components>(
    () => ({
      ...staticComponents,
      a: ({ children, href, ...props }) => {
        const ref = href ? parseCitationHref(href) : null;
        if (ref && href) {
          const resolved = resolvedCitations?.[citationKey(ref)];
          return (
            <CitationBubble
              index={citationOrder.get(href) ?? 1}
              resolved={resolved}
              unavailableLabel={t('chat.citation.unavailable')}
              onClick={clickCitation}
            />
          );
        }
        return (
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2 hover:no-underline"
          >
            {children}
          </a>
        );
      },
    }),
    [citationOrder, clickCitation, resolvedCitations, t],
  );
  // A message that has streamed is rendered block by block (see
  // `splitBlocks`), each keyed by its offset in the source, so a block that
  // settles never re-creates the ones after it. Only a block with words still
  // fading in is re-parsed per tick. It stays split after it settles: folding
  // it back into one render would rebuild its elements and jolt the text as
  // it finished.
  const animating = animateFrom !== undefined;
  const [streamed, setStreamed] = useState(animating);
  if (animating && !streamed) setStreamed(true);
  // Split as well when something has to be placed between the blocks.
  const blocks = useMemo(
    () =>
      streamed || placed.length > 0 ? splitBlocks(rewritten) : [{ start: 0, text: rewritten }],
    [placed.length, rewritten, streamed],
  );
  const lastEnd = rewritten.length;
  const insertsWithin = (from: number, to: number) =>
    placed
      .filter((insert) => insert.at > from && insert.at <= to)
      .map((insert) => (
        <div key={insert.key} data-slot="chat-markdown-insert" className="my-3 first:mt-0">
          {insert.node}
        </div>
      ));

  // Sized by whoever renders it — a reply, a tool block, the run inspector —
  // so the prose matches the text around it instead of a size of its own.
  return (
    <div data-slot="chat-markdown" className="break-words text-foreground">
      {/* The blocks are siblings of one parent, not wrapped, so the
          `first:`/`last:` margins on their elements read across the seams
          and the cuts are invisible. */}
      {/* An insert pinned before any prose (`at` 0) leads; one pinned inside
          a block follows that block; the rest trail the last block. */}
      {insertsWithin(Number.NEGATIVE_INFINITY, 0)}
      {blocks.map((block) => (
        <Fragment key={block.start}>
          <MarkdownBlock
            content={block.text}
            animateFrom={
              animateFrom !== undefined && block.start + block.text.length > animateFrom
                ? animateFrom - block.start
                : undefined
            }
            components={components}
          />
          {insertsWithin(block.start, block.start + block.text.length)}
        </Fragment>
      ))}
      {insertsWithin(lastEnd, Number.POSITIVE_INFINITY)}
      <SourcesFooter
        content={content}
        resolvedCitations={resolvedCitations}
        onCitationClick={clickCitation}
      />
    </div>
  );
}, chatMarkdownPropsEqual);

interface SourcesFooterProps {
  readonly content: string;
  readonly resolvedCitations?: Readonly<Record<string, ResolvedCitationViewModel>>;
  readonly onCitationClick?: (citation: ResolvedCitationViewModel) => void;
}

/**
 * Collapsible "Sources (N)" list below a message's body, matching AIP
 * Chatbot Studio's citation-prompt pattern (a numbered source list under the
 * reply, alongside the inline `CitationBubble` markers). Starts collapsed —
 * the bubbles already carry the trust signal inline; this is the "show your
 * work" detail view for a reader who wants it.
 */
function SourcesFooter({ content, resolvedCitations, onCitationClick }: SourcesFooterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const refs = useMemo(() => extractCitationRefs(content), [content]);

  if (refs.length === 0) return null;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-caption font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDownIcon
          size={15}
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
        {t('chat.citation.sources', { count: refs.length })}
      </button>
      {open && (
        <ol className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
          {refs.map((citationRef, index) => (
            <SourceRow
              key={citationKey(citationRef)}
              index={index + 1}
              resolved={resolvedCitations?.[citationKey(citationRef)]}
              unavailableLabel={t('chat.citation.unavailable')}
              onClick={onCitationClick}
              pageLabel={
                citationRef.page === undefined
                  ? null
                  : t('chat.citation.sourcePage', { page: citationRef.page })
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}

interface SourceRowProps {
  readonly index: number;
  readonly resolved: ResolvedCitationViewModel | undefined;
  readonly unavailableLabel: string;
  readonly pageLabel: string | null;
  readonly onClick?: (citation: ResolvedCitationViewModel) => void;
}

function SourceRow({ index, resolved, unavailableLabel, pageLabel, onClick }: SourceRowProps) {
  const unavailable = resolved === undefined || !resolved.found;
  return (
    <li className="flex items-baseline gap-1.5 text-caption">
      <span className="text-muted-foreground">
        <NumberBadge index={index} decorative />
      </span>
      {unavailable ? (
        <span className="text-muted-foreground italic">{unavailableLabel}</span>
      ) : (
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-left text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => onClick?.(resolved)}
        >
          {resolved.title}
          {pageLabel && <span className="text-muted-foreground"> · {pageLabel}</span>}
        </button>
      )}
    </li>
  );
}

interface CitationBubbleProps {
  readonly index: number;
  readonly resolved: ResolvedCitationViewModel | undefined;
  readonly unavailableLabel: string;
  readonly onClick?: (citation: ResolvedCitationViewModel) => void;
}

function CitationBubble({ index, resolved, unavailableLabel, onClick }: CitationBubbleProps) {
  if (!resolved) {
    return (
      <span className="mx-0.5 text-muted-foreground" aria-hidden="true">
        <NumberBadge index={index} decorative />
      </span>
    );
  }

  if (!resolved.found) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="mx-0.5 cursor-default text-muted-foreground">
            <NumberBadge index={index} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{unavailableLabel}</TooltipContent>
      </Tooltip>
    );
  }

  const tooltipLabel =
    resolved.page === undefined ? (resolved.title ?? '') : `${resolved.title} · p.${resolved.page}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="mx-0.5 cursor-pointer border-0 bg-transparent p-0 align-baseline font-medium text-primary"
          onClick={() => onClick?.(resolved)}
        >
          <NumberBadge index={index} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}

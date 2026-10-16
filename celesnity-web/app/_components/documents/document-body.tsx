import { useRef, type RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChartPreviewPane } from '@/app/_components/shared/chart-preview-pane';
import { ReportPdfExportButton } from '@/app/_components/documents/report-pdf-export-button';
import { parseChatChartPreview } from '@/src/entities/models/chat-chart-preview';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type { DocumentChartPreview } from '@/src/entities/models/document';

interface DocumentBodyProps {
  readonly content: string;
  readonly chartPreviews?: readonly DocumentChartPreview[];
  readonly renderer?: ChartRenderer;
  readonly pdfFilename?: string;
  readonly contentRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Markdown at document scale.
 *
 * Separate from the chat renderer on purpose: that one styles a paragraph
 * inside a bubble, where headings are rare and a table would not fit. A guide
 * is mostly headings and tables, so the two sets of rules do not overlap.
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-0 mb-5 text-heading-3 font-[650] tracking-[-0.025em]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 mb-3 text-body-lg font-[650] tracking-[-0.02em]">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-body-md font-[650]">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-[1.75] last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.7]">{children}</li>,
  strong: ({ children }) => <strong className="font-[650] text-foreground">{children}</strong>,
  hr: () => <hr className="my-7 border-border" />,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-body-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border bg-muted px-3 py-2 text-left text-caption font-[750] tracking-[0.04em] uppercase">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border px-3 py-2 align-top leading-[1.6]">{children}</td>
  ),
  code: ({ className, children, ...props }) => {
    // A fenced block arrives with a language class; an inline span does not.
    if (className !== undefined) {
      return (
        <code className="font-mono text-body-sm" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-sm" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg border border-border bg-muted p-4">
      {children}
    </pre>
  ),
};

export function DocumentBody({
  content,
  chartPreviews = [],
  renderer,
  pdfFilename,
  contentRef,
}: DocumentBodyProps) {
  const segments = splitChartPreviewMarkers(content, chartPreviews);
  const internalReportRef = useRef<HTMLDivElement>(null);
  const reportRef = contentRef ?? internalReportRef;

  return (
    <div className="w-full min-w-0 max-w-[760px] text-body-sm text-foreground">
      {pdfFilename && contentRef === undefined ? (
        <div className="mb-4 flex items-center justify-end">
          <ReportPdfExportButton contentRef={reportRef} filename={pdfFilename} />
        </div>
      ) : null}
      <div ref={reportRef} className="min-w-0 break-words" data-report-pdf-content>
        {segments.map((segment, index) =>
          segment.kind === 'markdown' ? (
            <ReactMarkdown
              key={`markdown-${index}`}
              components={components}
              remarkPlugins={[remarkGfm]}
            >
              {segment.content}
            </ReactMarkdown>
          ) : (
            <DocumentChartPreview
              key={`chart-${index}`}
              preview={segment.preview}
              renderer={renderer}
            />
          ),
        )}
      </div>
    </div>
  );
}

type DocumentBodySegment =
  | { readonly kind: 'markdown'; readonly content: string }
  | { readonly kind: 'chart'; readonly preview: DocumentChartPreview | undefined };

function splitChartPreviewMarkers(
  content: string,
  chartPreviews: readonly DocumentChartPreview[],
): readonly DocumentBodySegment[] {
  const segments: DocumentBodySegment[] = [];
  const marker = /<chart-preview(?:\s+title="([^"]*)")?\s*\/>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let previewIndex = 0;

  while ((match = marker.exec(content)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: 'markdown', content: content.slice(cursor, match.index) });
    }
    const title = match[1];
    const preview =
      (title === undefined
        ? chartPreviews[previewIndex]
        : chartPreviews.find((candidate) => candidate['title'] === title)) ?? undefined;
    segments.push({ kind: 'chart', preview });
    previewIndex += 1;
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) segments.push({ kind: 'markdown', content: content.slice(cursor) });
  return segments.length > 0 ? segments : [{ kind: 'markdown', content }];
}

function DocumentChartPreview({
  preview,
  renderer,
}: {
  readonly preview: DocumentChartPreview | undefined;
  readonly renderer: ChartRenderer | undefined;
}) {
  if (preview === undefined || renderer === undefined) {
    return <p className="my-4 italic text-muted-foreground">Chart preview unavailable.</p>;
  }

  const parsed = parseDocumentChartPreview(preview);
  if (parsed === null) {
    return <p className="my-4 italic text-muted-foreground">Chart preview unavailable.</p>;
  }

  return (
    <ChartPreviewPane
      status="SUCCEEDED"
      draft={{
        title: parsed.title,
        description: parsed.description,
        collectionId: '',
        queryDefinition: parsed.queryDefinition,
        visualizationDefinition: parsed.visualizationDefinition,
        outputSchema: parsed.outputSchema,
        parameterValues: parsed.parameterValues,
      }}
      rows={parsed.rows}
      renderer={renderer}
    />
  );
}

function parseDocumentChartPreview(preview: DocumentChartPreview) {
  try {
    return parseChatChartPreview({
      ...preview,
      run_id: preview['run_id'] ?? 'document-preview',
      row_count: preview['row_count'] ?? rowsOf(preview).length,
      byte_count: preview['byte_count'] ?? 0,
      truncated: preview['truncated'] ?? false,
      display_truncated: preview['display_truncated'] ?? false,
    });
  } catch {
    return null;
  }
}

function rowsOf(preview: DocumentChartPreview): readonly unknown[] {
  return Array.isArray(preview['rows']) ? preview['rows'] : [];
}

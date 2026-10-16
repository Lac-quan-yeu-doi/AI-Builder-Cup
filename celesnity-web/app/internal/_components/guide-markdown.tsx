import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown at manual scale, rendered on the server. Headings carry the
 * structure a reader scans, steps are numbered lists, and tables hold the
 * "field → meaning" pairs a guide is made of. Kept apart from the chat renderer
 * (a paragraph in a bubble) and the document body (a client component with
 * chart previews) on purpose: this one has no client-side behaviour at all.
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-0 mb-5 text-heading-3 font-[650] tracking-[-0.025em] text-foreground">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 mb-3 border-b border-border pb-2 text-body-lg font-[650] tracking-[-0.02em] text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-body-md font-[650] text-foreground">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-body-sm font-[650] text-foreground">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-body-md leading-[1.75] text-foreground last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 text-body-md leading-[1.7] last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-body-md leading-[1.7] last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-[1.7]">{children}</li>,
  strong: ({ children }) => <strong className="font-[650] text-foreground">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} className="text-primary underline underline-offset-4">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-status-info bg-status-info-light/40 px-4 py-2 text-body-md text-foreground [&_p]:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-border" />,
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
  code: ({ className, children, ...props }) =>
    className === undefined ? (
      <code
        className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-body-sm text-foreground"
        {...props}
      >
        {children}
      </code>
    ) : (
      <code className="font-mono text-body-sm" {...props}>
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-md border border-border bg-muted p-3 text-body-sm">
      {children}
    </pre>
  ),
};

export function GuideMarkdown({ content }: { readonly content: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </Markdown>
  );
}

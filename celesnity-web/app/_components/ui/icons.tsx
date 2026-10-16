import type { ReactElement, ReactNode, SVGProps } from 'react';

/**
 * Inline stroke icons. Kept dependency-free on purpose: the workspace needs a
 * handful of glyphs, and a single shared `<Icon>` wrapper guarantees they share
 * one grid, one stroke weight, and `currentColor` so a parent's text colour
 * drives them.
 *
 * Every icon is decorative — the label next to it carries the meaning — so the
 * wrapper hides them from assistive technology.
 */
export interface IconProps {
  readonly className?: string;
  /** Rendered width and height in pixels. */
  readonly size?: number;
}

export type IconComponent = (props: IconProps) => ReactElement;

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
} satisfies SVGProps<SVGSVGElement>;

interface IconShellProps extends IconProps {
  readonly children: ReactNode;
}

// 22, not 20: the type scale sits a step up (see `app/globals.css`), and a
// glyph that stayed at 20 read as a size behind the 15/16px text beside it.
function Icon({ children, className, size = 22 }: IconShellProps): ReactElement {
  return (
    <svg {...svgProps} className={className} height={size} width={size}>
      {children}
    </svg>
  );
}

/** Search: the magnifier that leads a filter field. */
export const SearchIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

/** Suggestions: the next questions an answer offers. */
export const SparklesIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" />
    <path d="M5 3l.6 1.6L7.2 5.2 5.6 5.8 5 7.4l-.6-1.6L2.8 5.2l1.6-.6Z" />
  </Icon>
);

/** Regenerate: ask for the answer again. */
export const RefreshIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </Icon>
);

/** Share: hand the answer on. */
export const ShareIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M12 3v12" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Icon>
);

/** Good answer. */
export const ThumbsUpIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M7 11v9" />
    <path d="M3 13v5a2 2 0 0 0 2 2h2" />
    <path d="M7 11l4-7a2.5 2.5 0 0 1 2.3 3.2L12.7 10H19a2 2 0 0 1 2 2.3l-1.2 6a2 2 0 0 1-2 1.7H7" />
  </Icon>
);

/** Poor answer. */
export const ThumbsDownIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M17 13V4" />
    <path d="M21 11V6a2 2 0 0 0-2-2h-2" />
    <path d="M17 13l-4 7a2.5 2.5 0 0 1-2.3-3.2l.6-2.8H5a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 6.2 4H17" />
  </Icon>
);

/** Connections: plugging the workspace into an external data source. */
export const PlugIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M9 2v6" />
    <path d="M15 2v6" />
    <path d="M6 8h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z" />
    <path d="M12 17v5" />
  </Icon>
);

/** MQTT streaming: a broadcast source emitting messages. */
export const RadioTowerIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4.9 16.1a7 7 0 0 1 0-9.9" />
    <path d="M19.1 6.2a7 7 0 0 1 0 9.9" />
    <path d="M7.8 13.2a3 3 0 0 1 0-4.2" />
    <path d="M16.2 9a3 3 0 0 1 0 4.2" />
    <path d="M12 12v9" />
    <path d="M9 21h6" />
  </Icon>
);

/** PySpark scripts: a source file, not a run of it. */
export const FileCodeIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="m10 13-2 2 2 2" />
    <path d="m14 13 2 2-2 2" />
  </Icon>
);

/** Executions: the history of past runs. */
export const HistoryIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </Icon>
);

/** Data catalog: the store of schemas and tables. */
export const DatabaseIcon: IconComponent = (props) => (
  <Icon {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </Icon>
);

/** Data pipelines: nodes wired into a flow. */
export const WorkflowIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect height="6" rx="1.5" width="7" x="3" y="3" />
    <rect height="6" rx="1.5" width="7" x="14" y="15" />
    <path d="M10 6h4a3 3 0 0 1 3 3v6" />
  </Icon>
);

/** SQL workbench: where statements are written and run. */
export const TerminalIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="m4 17 6-6-6-6" />
    <path d="M12 19h8" />
  </Icon>
);

/** AI chat: a conversation about the workspace. */
export const MessageSquareIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" />
    <path d="M8 9h8" />
    <path d="M8 12.5h5" />
  </Icon>
);

/** Document: a text file with lines. */
export const FileTextIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </Icon>
);

/** Narrow-screen navigation menu, closed state. */
export const MenuIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </Icon>
);

/** Dismiss: the narrow-screen menu and the floating canvas panels. */
export const CloseIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </Icon>
);

/** Confirm: approving a pending action, marking a step done. */
export const CheckIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

/** Copy to clipboard: a code block's copy action. */
export const CopyIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
  </Icon>
);

/** Elapsed time: how long a decided action took to resolve. */
export const ClockIcon: IconComponent = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

/** Chart attachment: a citation pointing at a chart. */
export const ChartIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M3 3v18h18" />
    <path d="M7 16v-4" />
    <path d="M12 16V8" />
    <path d="M17 16v-6" />
  </Icon>
);

/** Decorative opening quotation mark on a suggestion chip. */
export const QuoteIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M7 7h4v4a4 4 0 0 1-4 4" />
    <path d="M15 7h4v4a4 4 0 0 1-4 4" />
  </Icon>
);

/** Agent avatar placeholder in the agent-info panel. */
export const BotIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 8V4" />
    <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
    <path d="M9 13v2" />
    <path d="M15 13v2" />
  </Icon>
);

/** Expand/collapse: a disclosure toggle for a section that starts closed. */
export const ChevronDownIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

/** Back navigation, e.g. returning from a drilled-into detail view. */
export const ArrowLeftIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Icon>
);

/** Restricted environment marker in the workspace header. */
export const ShieldIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M12 3l7 3v5.5c0 4.2-2.9 8.1-7 9.5-4.1-1.4-7-5.3-7-9.5V6Z" />
  </Icon>
);

/** End the authenticated workspace session. */
export const LogOutIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
  </Icon>
);

/** Canvas rail: the configuration panel of the selected node. */
export const SlidersIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M5 21v-7" />
    <path d="M5 10V3" />
    <path d="M12 21v-11" />
    <path d="M12 6V3" />
    <path d="M19 21v-4" />
    <path d="M19 13V3" />
    <path d="M3 14h4" />
    <path d="M10 6h4" />
    <path d="M17 17h4" />
  </Icon>
);

/** Canvas rail: validation issues raised by the graph. */
export const AlertTriangleIcon: IconComponent = (props) => (
  <Icon {...props}>
    <path d="M10.3 4.3 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Icon>
);

/** Panel toggle, expanded state: pointing the panel closed. */
export const PanelLeftCloseIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </Icon>
);

/** Panel toggle, collapsed state: pointing the panel open. */
export const PanelLeftOpenIcon: IconComponent = (props) => (
  <Icon {...props}>
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <path d="M9 3v18" />
    <path d="m14 9 3 3-3 3" />
  </Icon>
);

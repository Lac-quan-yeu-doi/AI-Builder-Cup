export interface GridGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DashboardCardBase {
  readonly id: string;
  readonly tabId: string;
  readonly geometry: GridGeometry;
}

export interface DashboardChartCard extends DashboardCardBase {
  readonly kind: 'CHART';
  readonly chartId: string;
  readonly chartRevisionNumber: number | null;
  readonly visualizationOverrides: Readonly<Record<string, unknown>>;
}

export interface DashboardHeadingCard extends DashboardCardBase {
  readonly kind: 'HEADING';
  readonly content: Readonly<{ text: string }>;
}

export interface DashboardTextCard extends DashboardCardBase {
  readonly kind: 'TEXT';
  readonly content: Readonly<{ markdown: string }>;
}

export interface DashboardLinkCard extends DashboardCardBase {
  readonly kind: 'LINK';
  readonly content: Readonly<{ label: string; url: string }>;
}

export type DashboardCard =
  DashboardChartCard | DashboardHeadingCard | DashboardTextCard | DashboardLinkCard;

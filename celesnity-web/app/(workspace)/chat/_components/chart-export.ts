export type ChartExportFormat = 'png' | 'svg' | 'json';

/** Marks the element whose `<svg>` an export should serialise. */
export function chartExportRootAttribute(chartId: string): Record<string, string> {
  return { 'data-chart-export-root': chartId };
}

export interface ChartExportDefinition {
  readonly chartType: string;
  readonly encodings: unknown;
  readonly data: readonly unknown[];
}

/**
 * Exports a chart's current render.
 *
 * This used to re-embed the saved Vega spec off-DOM and call `view.toImageURL()`
 * / `view.toSVG()`. Recharts has no equivalent, and it does not need one — it
 * renders real DOM SVG, so the visible chart *is* the export source. The catch
 * is that its colours are `var(--mchart-N)`, which resolve against the document:
 * a detached clone would lose every one of them. So the clone is walked
 * alongside the live tree and each computed paint value is written on as a
 * literal.
 *
 * `json` no longer exports a Vega spec, which would be meaningless now. It
 * exports the chart's own definition — type, encodings and rows — which is what
 * Core actually stores and what the spec was derived from.
 */
export async function exportChart(
  chartId: string,
  title: string,
  format: ChartExportFormat,
  definition: ChartExportDefinition,
): Promise<void> {
  const filename = `${slugify(title)}.${format === 'json' ? 'chart.json' : format}`;

  if (format === 'json') {
    downloadBlob(
      new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' }),
      filename,
    );
    return;
  }

  const svg = resolvedSvg(chartId);
  if (!svg) throw new Error('No rendered chart to export');

  const markup = new XMLSerializer().serializeToString(svg);
  if (format === 'svg') {
    downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), filename);
    return;
  }

  downloadBlob(await rasterize(markup, svg), filename);
}

/**
 * Clones the live chart's `<svg>` with every inherited and custom-property
 * paint value resolved to a literal.
 */
function resolvedSvg(chartId: string): SVGSVGElement | null {
  // Matched by attribute value rather than a built selector: chart ids come from
  // the server and `CSS.escape` is not present in every environment this runs in.
  const host = Array.from(document.querySelectorAll('[data-chart-export-root]')).find(
    (element) => element.getAttribute('data-chart-export-root') === chartId,
  );
  const live = host?.querySelector('svg');
  if (!live) return null;

  const clone = live.cloneNode(true) as SVGSVGElement;
  const liveNodes = [live, ...Array.from(live.querySelectorAll('*'))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];

  liveNodes.forEach((node, index) => {
    const target = cloneNodes[index];
    if (!(target instanceof SVGElement || target instanceof HTMLElement)) return;
    const computed = getComputedStyle(node as Element);
    for (const property of [
      'fill',
      'stroke',
      'stroke-width',
      'opacity',
      'font-size',
      'font-family',
    ] as const) {
      const value = computed.getPropertyValue(property);
      if (value && value !== 'none') target.setAttribute(property, value);
    }
  });

  const { width, height } = live.getBoundingClientRect();
  clone.setAttribute('width', String(Math.round(width)));
  clone.setAttribute('height', String(Math.round(height)));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return clone;
}

async function rasterize(markup: string, live: SVGSVGElement): Promise<Blob> {
  const { width, height } = live.getBoundingClientRect();
  // Two device pixels per CSS pixel, so a pasted PNG is not soft on a retina screen.
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  // The chart surface is transparent in the DOM; a PNG needs a real ground.
  context.fillStyle =
    getComputedStyle(document.documentElement).getPropertyValue('--mchart-surface').trim() ||
    // A canvas fill needs a literal, and a PNG with no ground is a transparent
    // rectangle. Only reached if the token cannot be read.
    // eslint-disable-next-line no-restricted-syntax -- see above
    '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not rasterize the chart'));
    image.src = url;
  });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))),
      'image/png',
    );
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    downloadUrl(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'chart';
}

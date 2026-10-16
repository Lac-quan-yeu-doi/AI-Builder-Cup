import { parseDelimitedText } from '@/app/_components/chat/file-preview/delimited-text-parser';

const MAX_SAMPLE_BYTES = 1_000_000;
const EXPECTED_HEADERS = ['date', 'region', 'product', 'units', 'revenue'] as const;
const SAMPLE_NAMES = new Set(['retail-orders.csv', 'retail-orders.xlsx']);
const SAMPLE_SHA256: Readonly<Record<string, string>> = {
  'retail-orders.csv': '5b8ac771660932ef5cb6dfe8446e908bf5392ba9b522413eb7171f7ec024b213',
  'retail-orders.xlsx': '2d6596881156a4bcab610845ef426b612735c0e458e478acaa8864bc928284a3',
};

export interface TutorialSampleTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export async function parseTutorialSampleFile(file: File): Promise<TutorialSampleTable> {
  if (!SAMPLE_NAMES.has(file.name) || file.size <= 0 || file.size > MAX_SAMPLE_BYTES) {
    throw new Error('invalid_tutorial_sample');
  }

  const buffer = await file.arrayBuffer();
  if ((await sha256(buffer)) !== SAMPLE_SHA256[file.name]) {
    throw new Error('invalid_tutorial_sample');
  }

  const table = file.name.endsWith('.csv')
    ? parseCsv(new TextDecoder().decode(buffer))
    : await parseXlsx(buffer);
  if (
    table.rows.length === 0 ||
    table.headers.length !== EXPECTED_HEADERS.length ||
    !table.headers.every((header, index) => header === EXPECTED_HEADERS[index])
  ) {
    throw new Error('invalid_tutorial_sample');
  }
  return table;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function parseCsv(source: string): TutorialSampleTable {
  const parsed = parseDelimitedText(source, { delimiter: ',', maxRows: 100, maxColumns: 10 });
  return { headers: parsed.headers, rows: parsed.rows };
}

async function parseXlsx(buffer: ArrayBuffer): Promise<TutorialSampleTable> {
  const { strFromU8, unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer));
  const sheet = files['xl/worksheets/sheet1.xml'];
  if (sheet === undefined) throw new Error('invalid_tutorial_sample');

  const sharedStringsFile = files['xl/sharedStrings.xml'];
  const sharedStrings =
    sharedStringsFile === undefined
      ? []
      : elements(strFromU8(sharedStringsFile), 'si').map((item) => textOf(item, 't'));
  const rows = elements(strFromU8(sheet), 'row').map((row) =>
    elements(row, 'c').map((cell) => {
      const type = attributeOf(cell, 't');
      if (type === 'inlineStr') return textOf(cell, 't');
      const value = textOf(cell, 'v');
      if (type !== 's') return value;
      const index = Number.parseInt(value, 10);
      return Number.isInteger(index) ? (sharedStrings[index] ?? '') : '';
    }),
  );
  const [headers = [], ...dataRows] = rows;
  return { headers, rows: dataRows };
}

function elements(source: string, tag: string): readonly string[] {
  const matches = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gu'));
  return matches ?? [];
}

function textOf(source: string, tag: string): string {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'u'));
  return decodeXml(match?.[1] ?? '');
}

function attributeOf(source: string, name: string): string | null {
  return source.match(new RegExp(`\\s${name}="([^"]*)"`, 'u'))?.[1] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

import type { PreviewKind, PreviewPolicy } from './file-preview.types';

const MIB = 1024 * 1024;

const SOURCE_EXTENSIONS: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  css: 'css',
  scss: 'scss',
  less: 'less',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  toml: 'ini',
  ini: 'ini',
  txt: 'plaintext',
  log: 'plaintext',
};

const GENERIC_MIMES = new Set(['text/plain', 'application/octet-stream']);

const POLICY_BY_KIND: Readonly<Record<PreviewKind, PreviewPolicy>> = {
  text: { kind: 'text', maxInlineBytes: 2 * MIB, label: 'text' },
  markdown: { kind: 'markdown', maxInlineBytes: 2 * MIB, label: 'markdown' },
  json: { kind: 'json', maxInlineBytes: 2 * MIB, label: 'json' },
  table: { kind: 'table', maxInlineBytes: 5 * MIB, label: 'table' },
  image: { kind: 'image', maxInlineBytes: 20 * MIB, label: 'image' },
  pdf: { kind: 'pdf', maxInlineBytes: 20 * MIB, label: 'pdf' },
  audio: { kind: 'audio', maxInlineBytes: 20 * MIB, label: 'audio' },
  video: { kind: 'video', maxInlineBytes: 20 * MIB, label: 'video' },
  'source-only': { kind: 'source-only', maxInlineBytes: 2 * MIB, label: 'source' },
  binary: { kind: 'binary', maxInlineBytes: 0, label: 'binary' },
};

const SPECIFIC_MIME_KINDS: Readonly<Record<string, PreviewKind>> = {
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'application/json': 'json',
  'text/json': 'json',
  'text/csv': 'table',
  'application/csv': 'table',
  'text/tab-separated-values': 'table',
  'text/tsv': 'table',
  'application/pdf': 'pdf',
  'image/svg+xml': 'source-only',
  'text/html': 'source-only',
  'application/xhtml+xml': 'source-only',
  'application/javascript': 'text',
  'application/typescript': 'text',
  'application/xml': 'text',
  'application/x-yaml': 'text',
  'application/yaml': 'text',
};

const EXTENSION_KINDS: Readonly<Record<string, PreviewKind>> = {
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  csv: 'table',
  tsv: 'table',
  html: 'source-only',
  htm: 'source-only',
  svg: 'source-only',
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  avif: 'image',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  flac: 'audio',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
};

export function normalizeMimeType(mimeType: string | undefined): string | undefined {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}

export function previewPolicyFor(path: string, mimeType?: string): PreviewPolicy {
  const normalizedMime = normalizeMimeType(mimeType);
  const specificKind =
    normalizedMime === undefined ? undefined : SPECIFIC_MIME_KINDS[normalizedMime];
  if (specificKind !== undefined) return policyWithLanguage(specificKind);

  if (normalizedMime !== undefined && !GENERIC_MIMES.has(normalizedMime)) {
    if (normalizedMime.startsWith('image/')) return policyWithLanguage('image');
    if (normalizedMime.startsWith('audio/')) return policyWithLanguage('audio');
    if (normalizedMime.startsWith('video/')) return policyWithLanguage('video');
    if (normalizedMime.startsWith('text/')) return policyWithLanguage('text');
  }

  const extension = extensionOf(path);
  const extensionKind = EXTENSION_KINDS[extension];
  if (extensionKind !== undefined) return policyWithLanguage(extensionKind);

  const sourceLanguage = SOURCE_EXTENSIONS[extension];
  if (sourceLanguage !== undefined) {
    return { ...POLICY_BY_KIND.text, language: sourceLanguage };
  }

  if (normalizedMime?.startsWith('text/')) return policyWithLanguage('text');
  return policyWithLanguage('binary');
}

export function isPreviewOverLimit(policy: PreviewPolicy, sizeBytes: number | undefined): boolean {
  if (policy.maxInlineBytes === 0) return true;
  return sizeBytes !== undefined && sizeBytes > policy.maxInlineBytes;
}

function policyWithLanguage(kind: PreviewKind): PreviewPolicy {
  const policy = POLICY_BY_KIND[kind];
  if (kind === 'text') return { ...policy, language: 'plaintext' };
  return policy;
}

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/u).pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

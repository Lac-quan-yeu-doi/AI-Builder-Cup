import type { Translator } from '@/app/_i18n/translate';

export type PreviewKind =
  | 'text'
  | 'markdown'
  | 'json'
  | 'table'
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'source-only'
  | 'binary';

export interface PreviewPolicy {
  readonly kind: PreviewKind;
  readonly maxInlineBytes: number;
  readonly language?: string;
  readonly label: string;
}

export interface FilePreviewContext {
  readonly path: string;
  readonly fileName: string;
  readonly kind: PreviewKind;
  readonly language?: string;
  readonly text?: string;
  readonly blob?: Blob;
  readonly objectUrl?: string;
  readonly t: Translator;
}

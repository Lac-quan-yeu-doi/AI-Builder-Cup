import type { CloudFileKind } from '@application/cloud-file/interfaces/i-cloud-file-source';

export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv';

const KIND_BY_MIME: Readonly<Record<string, CloudFileKind>> = {
  [GOOGLE_SHEET_MIME]: 'spreadsheet',
  [XLSX_MIME]: 'spreadsheet',
  [CSV_MIME]: 'spreadsheet',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.google-apps.document': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'text/plain': 'document',
  'application/vnd.google-apps.presentation': 'presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/pdf': 'pdf',
  [GOOGLE_FOLDER_MIME]: 'folder',
};

export const EXPORT_MIME_BY_NATIVE: Readonly<Record<string, string>> = {
  [GOOGLE_SHEET_MIME]: XLSX_MIME,
  'application/vnd.google-apps.document':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.presentation':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function kindOfMime(mimeType: string): CloudFileKind {
  return KIND_BY_MIME[mimeType] ?? 'other';
}

export function isGoogleNative(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-apps.');
}

export function mimeTypesOfKind(kind: CloudFileKind): readonly string[] {
  return Object.entries(KIND_BY_MIME)
    .filter(([, value]) => value === kind)
    .map(([mime]) => mime);
}

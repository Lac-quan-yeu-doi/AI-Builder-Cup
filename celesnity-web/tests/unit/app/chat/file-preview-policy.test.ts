import { describe, expect, it } from 'vitest';

import {
  isPreviewOverLimit,
  normalizeMimeType,
  previewPolicyFor,
} from '@/app/_components/chat/file-preview/file-preview-policy';

describe('previewPolicyFor', () => {
  it('normalizes MIME parameters and casing', () => {
    expect(normalizeMimeType(' Text/Plain; charset=utf-8 ')).toBe('text/plain');
    expect(normalizeMimeType(undefined)).toBeUndefined();
  });

  it('uses a specific MIME over a misleading extension', () => {
    expect(previewPolicyFor('report.txt', 'application/pdf').kind).toBe('pdf');
  });

  it('uses an extension when the response MIME is generic', () => {
    expect(previewPolicyFor('notes.md', 'text/plain').kind).toBe('markdown');
  });

  it('classifies CSV and TSV with the table policy', () => {
    expect(previewPolicyFor('rows.csv', 'application/octet-stream').kind).toBe('table');
    expect(previewPolicyFor('rows.tsv', undefined).kind).toBe('table');
  });

  it('maps source languages by extension', () => {
    expect(previewPolicyFor('src/main.ts', 'text/plain')).toMatchObject({
      kind: 'text',
      language: 'typescript',
      maxInlineBytes: 2 * 1024 * 1024,
    });
  });

  it('keeps active HTML and SVG out of the renderer set', () => {
    expect(previewPolicyFor('page.html').kind).toBe('source-only');
    expect(previewPolicyFor('icon.svg', 'image/svg+xml').kind).toBe('source-only');
  });

  it('falls back to binary for unknown formats', () => {
    expect(previewPolicyFor('archive.bin', 'application/octet-stream').kind).toBe('binary');
  });
});

describe('isPreviewOverLimit', () => {
  it('uses the policy limit and allows unknown sizes until fetch time', () => {
    const policy = previewPolicyFor('rows.csv');
    expect(isPreviewOverLimit(policy, undefined)).toBe(false);
    expect(isPreviewOverLimit(policy, 5 * 1024 * 1024)).toBe(false);
    expect(isPreviewOverLimit(policy, 5 * 1024 * 1024 + 1)).toBe(true);
  });

  it('prevents inline binary previews', () => {
    expect(isPreviewOverLimit(previewPolicyFor('archive.bin'), 0)).toBe(true);
  });
});

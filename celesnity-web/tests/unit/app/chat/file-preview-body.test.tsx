// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '@/app/_i18n/translate';
import { FilePreviewBody } from '@/app/_components/chat/file-preview/file-preview-body';
import type { FilePreviewContext } from '@/app/_components/chat/file-preview/file-preview.types';
import { renderUi } from '@/tests/support/render-ui';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, language }: { readonly value: string; readonly language: string }) =>
    createElement('pre', { 'aria-label': `source-${language}` }, value),
}));

vi.mock('@atomic-editor/editor', () => ({
  AtomicCodeMirrorEditor: ({
    markdownSource,
    readOnly,
  }: {
    readonly markdownSource: string;
    readonly readOnly?: boolean;
  }) =>
    createElement(
      'div',
      {
        'aria-label': 'Markdown reading surface',
        'data-editor': 'atomic',
        'data-read-only': readOnly ? 'true' : undefined,
      },
      markdownSource,
    ),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({ promise: new Promise(() => {}), destroy: vi.fn() }),
}));

const t = createTranslator('en');

function context(
  kind: FilePreviewContext['kind'],
  overrides: Partial<FilePreviewContext> = {},
): FilePreviewContext {
  return {
    path: 'report.txt',
    fileName: 'report.txt',
    kind,
    text: 'plain source',
    t,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FilePreviewBody', () => {
  it('renders source-like content in read-only Monaco', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('text', { language: 'typescript', text: 'const answer = 42;' }),
      }),
    );

    expect(screen.getByLabelText('source-typescript').textContent).toBe('const answer = 42;');
  });

  it('renders Markdown in the read-only atomic editor', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('markdown', { path: 'README.md', text: '# Hello' }),
      }),
    );

    const editor = screen.getByLabelText('Markdown reading surface');
    const surface = editor.parentElement;
    expect(editor.getAttribute('data-editor')).toBe('atomic');
    expect(editor.getAttribute('data-read-only')).toBe('true');
    expect(surface?.getAttribute('data-editor')).toBe('atomic');
    expect(surface?.className).not.toContain('rounded-lg');
    expect(surface?.className).not.toContain('border');
    expect(surface?.className).not.toContain('bg-card');
    expect(surface?.className).not.toContain('shadow-inner');
    expect(editor.textContent).toBe('# Hello');
  });

  it('rewrites citation tags before passing Markdown to the atomic editor', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('markdown', {
          path: 'report.md',
          text: 'See the chart <citation><type>chart</type><id>chart-1</id></citation>.',
        }),
      }),
    );

    expect(screen.getByLabelText('Markdown reading surface').textContent).toContain(
      '[cite](citation://chart/chart-1)',
    );
    expect(screen.queryByText(/<citation>/u)).toBeNull();
  });

  it('renders valid JSON as an expandable structured view', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('json', { path: 'result.json', text: '{"answer":42}' }),
      }),
    );

    expect(screen.getByText('answer')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('falls back to raw source for invalid JSON', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('json', { path: 'result.json', text: '{invalid' }),
      }),
    );

    expect(screen.getByText('{invalid')).toBeTruthy();
    expect(screen.getByText('Could not parse this JSON file.')).toBeTruthy();
  });

  it('renders CSV as a bounded table', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('table', { path: 'rows.csv', text: 'name,score\nAda,10' }),
      }),
    );

    expect(screen.getByRole('columnheader', { name: 'name' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Ada' })).toBeTruthy();
  });

  it('renders raster images from supplied object URLs and PDFs in an in-app viewer', () => {
    const { rerender } = renderUi(
      createElement(FilePreviewBody, {
        context: context('image', {
          path: 'chart.png',
          objectUrl: 'blob:image',
        }),
      }),
    );
    expect(screen.getByRole('img', { name: 'chart.png' }).getAttribute('src')).toBe('blob:image');

    rerender(
      createElement(FilePreviewBody, {
        context: context('pdf', {
          path: 'report.pdf',
          fileName: 'report.pdf',
          objectUrl: 'blob:pdf',
          blob: new Blob(['%PDF-1.7']),
        }),
      }),
    );
    expect(screen.getByRole('region', { name: 'report.pdf' })).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('renders native audio and video controls', () => {
    const { container } = renderUi(
      createElement(FilePreviewBody, {
        context: context('audio', { path: 'voice.mp3', objectUrl: 'blob:audio' }),
      }),
    );
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:audio');

    renderUi(
      createElement(FilePreviewBody, {
        context: context('video', { path: 'clip.mp4', objectUrl: 'blob:video' }),
      }),
    );
    expect(document.querySelector('video')?.getAttribute('src')).toBe('blob:video');
  });

  it('renders HTML and SVG as source-only content', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('source-only', {
          path: 'page.html',
          language: 'html',
          text: '<script>alert(1)</script>',
        }),
      }),
    );

    expect(screen.getByLabelText('source-html').textContent).toBe('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders the translated binary fallback', () => {
    renderUi(
      createElement(FilePreviewBody, {
        context: context('binary', { path: 'archive.zip', text: undefined }),
      }),
    );

    expect(screen.getByText('Preview not available — download to view.')).toBeTruthy();
  });
});

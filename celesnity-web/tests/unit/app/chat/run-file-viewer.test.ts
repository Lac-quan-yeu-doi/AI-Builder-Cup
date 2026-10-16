// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { createTranslator } from '@/app/_i18n/translate';
import { RunFileViewer } from '@/app/_components/chat/run-file-viewer';
import type { RunFileContent, RunFileEntry } from '@/src/entities/models/chat';

// Monaco is heavy and DOM-driven; the mock mirrors
// tests/unit/app/pipeline-canvas-screen.test.ts and surfaces the source text
// so the text branch is assertable.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { readonly value: string }) =>
    createElement('pre', { 'aria-label': 'file source' }, value),
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

const t = createTranslator('en');

function entry(overrides: Partial<RunFileEntry> = {}): RunFileEntry {
  return {
    path: 'src/a.ts',
    accessType: 'created',
    toolName: 'write_file',
    accessedAt: '2026-01-01T00:00:00.000Z',
    available: true,
    ...overrides,
  };
}

function content(overrides: Partial<RunFileContent> = {}): RunFileContent {
  const blob = overrides.blob ?? new Blob(['const answer = 42;'], { type: 'text/plain' });
  return {
    blob,
    mimeType: overrides.mimeType ?? 'text/plain',
    sizeBytes: overrides.sizeBytes ?? blob.size,
    fileName: overrides.fileName ?? 'a.ts',
  };
}

/**
 * jsdom's Blob does not implement `.text()`, which the text branch calls.
 * Return a Blob-like whose `.text()` resolves the given source so the Monaco
 * branch is exercisable without a real browser.
 */
function textBlob(source: string): Blob {
  const blob = new Blob([source], { type: 'text/plain' });
  Object.defineProperty(blob, 'text', { value: () => Promise.resolve(source) });
  return blob;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:sentinel');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RunFileViewer', () => {
  it('labels the preview with a localized file-type badge', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValue(content({ blob: textBlob('# Title'), mimeType: 'text/markdown' }));

    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'README.md', mimeType: 'text/markdown' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    expect(await screen.findByText(t('chat.workspace.preview.type.markdown'))).toBeTruthy();
  });
  it('renders a text file in the Monaco editor and always shows Download', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValue(content({ blob: textBlob('const answer = 42;'), mimeType: 'text/plain' }));

    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'src/a.ts' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    const source = await screen.findByLabelText('file source');
    expect(source.textContent).toBe('const answer = 42;');
    expect(getRunFileContent).toHaveBeenCalledWith('run-1', 'src/a.ts');
    expect(
      screen.getByRole('button', { name: t('chat.runInspector.files.download') }),
    ).toBeTruthy();
  });

  it('renders an image via an object URL', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValue(
        content({ blob: new Blob(['\x89PNG'], { type: 'image/png' }), mimeType: 'image/png' }),
      );

    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'chart.png' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('blob:sentinel');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('renders a PDF in an iframe via an object URL', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValue(
        content({
          blob: new Blob(['%PDF'], { type: 'application/pdf' }),
          mimeType: 'application/pdf',
        }),
      );

    const { container } = render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'report.pdf' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    await waitFor(() => {
      const frame = container.querySelector('iframe');
      expect(frame).not.toBeNull();
      expect(frame?.getAttribute('src')).toBe('blob:sentinel');
    });
  });

  it('refetches when the selected file metadata changes', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValueOnce(content({ blob: textBlob('before'), mimeType: 'text/plain' }))
      .mockResolvedValueOnce(content({ blob: textBlob('after'), mimeType: 'text/plain' }));
    const view = render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ accessedAt: '2026-01-01T00:00:00.000Z' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    expect(await screen.findByText('before')).not.toBeNull();
    view.rerender(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ accessedAt: '2026-01-01T00:01:00.000Z' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    expect(await screen.findByText('after')).not.toBeNull();
    expect(getRunFileContent).toHaveBeenCalledTimes(2);
  });

  it('shows a download-only message for an over-cap file and does NOT fetch on mount', () => {
    const getRunFileContent = vi.fn<(runId: string, path: string) => Promise<RunFileContent>>();

    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'huge.bin', sizeBytes: 3 * 1024 * 1024 }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    expect(screen.getByText(t('chat.runInspector.files.tooLarge'))).toBeTruthy();
    expect(getRunFileContent).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: t('chat.runInspector.files.download') }),
    ).toBeTruthy();
  });

  it('downloads via an anchor when Download is clicked (fetches when not yet loaded)', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValue(
        content({
          blob: new Blob(['data'], { type: 'application/octet-stream' }),
          mimeType: 'application/octet-stream',
        }),
      );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        // over-cap so the mount fetch is skipped; download must fetch on click
        entry: entry({ path: 'huge.bin', sizeBytes: 3 * 1024 * 1024 }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: t('chat.runInspector.files.download') }));

    await waitFor(() => {
      expect(getRunFileContent).toHaveBeenCalledWith('run-1', 'huge.bin');
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  it('renders Markdown from a generic text response using the file extension', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValue(
        content({ blob: textBlob('# Hello'), mimeType: 'text/plain', fileName: 'README.md' }),
      );

    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'README.md' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    const editor = await screen.findByLabelText('Markdown reading surface');
    expect(editor.getAttribute('data-editor')).toBe('atomic');
    expect(editor.getAttribute('data-read-only')).toBe('true');
    expect(editor.textContent).toContain('# Hello');
  });

  it('renders JSON and CSV with their specialized preview policies', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockImplementation(async (_runId, path) =>
        path.endsWith('.json')
          ? content({ blob: textBlob('{"answer":42}'), mimeType: 'application/json' })
          : content({ blob: textBlob('name,score\\nAda,10'), mimeType: 'text/plain' }),
      );

    const view = render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'result.json' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );
    expect(await screen.findByText('answer')).toBeTruthy();

    view.rerender(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'rows.csv', accessedAt: '2026-01-01T00:01:00.000Z' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );
    expect(await screen.findByRole('columnheader', { name: 'name' })).toBeTruthy();
    expect(getRunFileContent).toHaveBeenCalledTimes(2);
  });

  it('does not fetch an unknown binary file for inline preview', () => {
    const getRunFileContent = vi.fn<(runId: string, path: string) => Promise<RunFileContent>>();

    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'archive.bin' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    expect(screen.getByText(t('chat.runInspector.files.binary'))).toBeTruthy();
    expect(getRunFileContent).not.toHaveBeenCalled();
  });

  it('revokes a media object URL when the viewer unmounts', async () => {
    const getRunFileContent = vi
      .fn<(runId: string, path: string) => Promise<RunFileContent>>()
      .mockResolvedValue(
        content({ blob: new Blob(['PNG'], { type: 'image/png' }), mimeType: 'image/png' }),
      );

    const view = render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'chart.png' }),
        getRunFileContent,
        onBack: vi.fn(),
        t,
      }),
    );

    await screen.findByRole('img');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:sentinel');
  });

  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn();
    render(
      createElement(RunFileViewer, {
        runId: 'run-1',
        entry: entry({ path: 'huge.bin', sizeBytes: 3 * 1024 * 1024 }),
        getRunFileContent: vi.fn(),
        onBack,
        t,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: t('chat.runInspector.files.back') }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

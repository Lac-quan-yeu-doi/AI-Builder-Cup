// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentsScreen } from '@/app/(workspace)/documents/_components/documents-screen';
import type { DocumentViewModel } from '@/src/interface-adapters/presenters/document.presenter';

function doc(overrides: Partial<DocumentViewModel> = {}): DocumentViewModel {
  return {
    id: 'doc-1',
    filename: 'daily-report.md',
    mimeType: 'text/markdown',
    pageCount: 1,
    extractionStatus: 'extracted',
    chartPreviews: [],
    createdAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('DocumentsScreen — preview panel', () => {
  it('renders a markdown document as formatted markdown, not raw text with visible syntax', async () => {
    const controllers = {
      list: vi.fn().mockResolvedValue([doc()]),
      upload: vi.fn(),
      getContent: vi.fn().mockResolvedValue({
        kind: 'text',
        content: {
          documentId: 'doc-1',
          pageCount: 1,
          extractionStatus: 'extracted',
          text: '# Daily report\n\nEverything looks good.',
          chartPreviews: [],
        },
      }),
    };
    render(createElement(DocumentsScreen, { controllers }));

    await screen.findByText('daily-report.md');
    fireEvent.click(screen.getByText('daily-report.md'));

    await screen.findByText('Everything looks good.');
    expect(screen.getByRole('heading', { name: 'Daily report' })).toBeTruthy();
    expect(screen.queryByText(/^# Daily report/)).toBeNull();
  });

  it('renders a plain-text document as preformatted text, not markdown', async () => {
    const controllers = {
      list: vi
        .fn()
        .mockResolvedValue([doc({ id: 'doc-2', filename: 'notes.txt', mimeType: 'text/plain' })]),
      upload: vi.fn(),
      getContent: vi.fn().mockResolvedValue({
        kind: 'text',
        content: {
          documentId: 'doc-2',
          pageCount: 1,
          extractionStatus: 'extracted',
          text: '# not a heading, just text',
          chartPreviews: [],
        },
      }),
    };
    render(createElement(DocumentsScreen, { controllers }));

    await screen.findByText('notes.txt');
    fireEvent.click(screen.getByText('notes.txt'));

    await waitFor(() => expect(screen.getByText('# not a heading, just text')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'not a heading, just text' })).toBeNull();
  });

  it('renders the original PDF even when text extraction found no text', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const controllers = {
      list: vi.fn().mockResolvedValue([
        doc({
          filename: 'scan.pdf',
          mimeType: 'application/pdf',
          extractionStatus: 'no_text_found',
        }),
      ]),
      upload: vi.fn(),
      getContent: vi.fn().mockResolvedValue({
        kind: 'file',
        blob: new Blob(['%PDF-test'], { type: 'application/pdf' }),
      }),
    };
    const { unmount } = render(createElement(DocumentsScreen, { controllers }));
    await screen.findByText('scan.pdf');
    fireEvent.click(screen.getByText('scan.pdf'));

    const iframe = await screen.findByTitle('scan.pdf');
    expect(iframe.getAttribute('src')).toBe('blob:report');
    expect(controllers.getContent).toHaveBeenCalledWith({
      documentId: 'doc-1',
      mimeType: 'application/pdf',
    });
    expect(screen.getByRole('link', { name: 'Download file' }).getAttribute('download')).toBe(
      'scan.pdf',
    );
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
    vi.unstubAllGlobals();
  });
});

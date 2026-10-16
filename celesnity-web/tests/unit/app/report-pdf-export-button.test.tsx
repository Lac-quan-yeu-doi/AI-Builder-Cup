// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pdfState = vi.hoisted(() => ({
  observedWidth: undefined as string | undefined,
  save: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('html2pdf.js', () => ({
  default: () => {
    const api = {
      set: vi.fn(() => api),
      from: vi.fn((element: HTMLElement) => {
        pdfState.observedWidth = element.style.width;
        return api;
      }),
      save: pdfState.save,
    };
    return api;
  },
}));

import { ReportPdfExportButton } from '@/app/_components/documents/report-pdf-export-button';
import { renderUi } from '@/tests/support/render-ui';

afterEach(() => {
  cleanup();
  pdfState.observedWidth = undefined;
  pdfState.save.mockClear();
});

describe('ReportPdfExportButton', () => {
  it('expands the report to the PDF content width before capture and restores the sidebar width', async () => {
    const contentRef = createRef<HTMLDivElement>();

    renderUi(
      <>
        <div ref={contentRef}>Report</div>
        <ReportPdfExportButton contentRef={contentRef} filename="report.md" />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

    await waitFor(() => expect(pdfState.save).toHaveBeenCalled());
    expect(pdfState.observedWidth).toBe('688px');
    expect(contentRef.current?.style.width).toBe('');
  });
});

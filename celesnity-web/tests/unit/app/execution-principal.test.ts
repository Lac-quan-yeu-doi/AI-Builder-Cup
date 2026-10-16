// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExecutionDetail } from '@/app/_components/execution/execution-detail';
import { renderUi } from '@/tests/support/render-ui';
afterEach(cleanup);
it('identifies the executor and directs source access failures to catalog settings', () => {
  renderUi(
    createElement(ExecutionDetail, {
      getLogs: vi.fn(),
      pipelineNames: {},
      liveMode: 'idle',
      isCancelling: false,
      isRerunning: false,
      onCancel: vi.fn(),
      onRerun: vi.fn(),
      execution: {
        id: 'run-1',
        workloadKind: 'PIPELINE',
        executionPrincipal: 'BACKGROUND',
        versionNumber: 2,
        status: 'failed',
        errorSummary: 'SOURCE_ACCESS_DENIED: Access denied',
        queuedAt: '2026-10-01T08:04:00Z',
        updatedAt: '2026-10-01T08:04:01Z',
      },
    }),
  );
  expect(screen.getByText('Runs as')).toBeTruthy();
  expect(screen.getByText('Background executor')).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: 'Manage catalog access (organization admins)' })
      .getAttribute('href'),
  ).toBe('/administration?tab=catalog-access');
});

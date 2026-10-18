// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExecutionDetail } from '@/app/_components/execution/execution-detail';
import { renderUi } from '@/tests/support/render-ui';
afterEach(cleanup);
it('identifies the executor without linking source access failures to paused administration', () => {
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
  // Administration is paused for the six-capability workspace, so the failure
  // no longer links to its catalog-access tab.
  expect(
    screen.queryByRole('link', { name: 'Manage catalog access (organization admins)' }),
  ).toBeNull();
});

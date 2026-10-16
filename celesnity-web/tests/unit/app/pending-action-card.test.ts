// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PendingActionCard,
  PendingActionsForRun,
} from '@/app/_components/chat/pending-action-card';
import { renderUi } from '@/tests/support/render-ui';
import type { ApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import type { ListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import type { RejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';
import type { PendingActionViewModel } from '@/src/interface-adapters/presenters/pending-action.presenter';

const baseAction = (overrides: Partial<PendingActionViewModel> = {}): PendingActionViewModel => ({
  id: 'pending-1',
  actionName: 'chart.delete',
  input: { chart_id: 'chart-1' },
  actor: { source: 'agent', runId: 'run-1', identityId: null },
  status: 'pending',
  rationale: 'Duplicate chart',
  result: null,
  errorMessage: null,
  createdAt: '2026-08-25T00:00:00.000Z',
  decidedAt: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('PendingActionCard', () => {
  it('approves a pending action and shows the outcome', async () => {
    const action = baseAction();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    const onReject = vi.fn();

    renderUi(createElement(PendingActionCard, { action, onApprove, onReject }));

    expect(screen.getByText('Pending user approval…')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
  });

  it('rejects a pending action', async () => {
    const action = baseAction();
    const onApprove = vi.fn();
    const onReject = vi.fn().mockResolvedValue(undefined);

    renderUi(createElement(PendingActionCard, { action, onApprove, onReject }));
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));

    await waitFor(() => expect(onReject).toHaveBeenCalledTimes(1));
  });

  it('disables decision buttons and shows an expired label once the TTL has passed', () => {
    const action = baseAction({ expiresAt: '2020-01-01T00:00:00.000Z' });

    renderUi(createElement(PendingActionCard, { action, onApprove: vi.fn(), onReject: vi.fn() }));

    expect(screen.getByText('Expired')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reject/ })).toBeNull();
  });

  it('shows a duration badge and no buttons once already decided', () => {
    const action = baseAction({
      status: 'approved',
      decidedAt: '2026-08-25T00:00:00.500Z',
    });

    renderUi(createElement(PendingActionCard, { action, onApprove: vi.fn(), onReject: vi.fn() }));

    expect(screen.getByText('0.500s')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
  });
});

describe('PendingActionsForRun', () => {
  it('lists pending actions filtered by the given run', async () => {
    const listPendingActions = vi.fn(async () => [
      baseAction(),
    ]) as unknown as ListPendingActionsController;

    renderUi(
      createElement(PendingActionsForRun, {
        runId: 'run-1',
        listPendingActions,
        approvePendingAction: vi.fn() as unknown as ApprovePendingActionController,
        rejectPendingAction: vi.fn() as unknown as RejectPendingActionController,
      }),
    );

    await waitFor(() => expect(screen.getByText('chart.delete')).toBeDefined());
    expect(listPendingActions).toHaveBeenCalledWith({ runId: 'run-1' });
  });

  it('renders nothing when there are no pending actions and no emptyLabel is given', async () => {
    const listPendingActions = vi.fn(async () => []) as unknown as ListPendingActionsController;

    renderUi(
      createElement(PendingActionsForRun, {
        runId: 'run-1',
        listPendingActions,
        approvePendingAction: vi.fn() as unknown as ApprovePendingActionController,
        rejectPendingAction: vi.fn() as unknown as RejectPendingActionController,
      }),
    );

    await waitFor(() => expect(listPendingActions).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('chart.delete')).toBeNull();
  });
});

describe('PendingActionCard lab-style approval surface', () => {
  it('shows a waiting-for-you summary and explains that a typed answer can replace the decision', () => {
    renderUi(
      createElement(PendingActionCard, {
        action: baseAction(),
        onApprove: vi.fn(),
        onReject: vi.fn(),
      }),
    );

    expect(screen.getByText('Waiting for you')).toBeDefined();
    expect(screen.getByText('or answer below in your own words')).toBeDefined();
    expect(screen.getByText('chart.delete')).toBeDefined();
  });
});

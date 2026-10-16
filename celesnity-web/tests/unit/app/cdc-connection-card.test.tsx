// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CdcConnectionCard } from '@/app/_components/database-service/cdc-connection-card';
import { NotFoundError } from '@/src/entities/errors/application-errors';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('CdcConnectionCard', () => {
  it('shows a separate setup action when no CDC profile exists', async () => {
    const controller = {
      get: vi.fn().mockRejectedValue(new NotFoundError('missing')),
      save: vi.fn(),
      validate: vi.fn(),
      remove: vi.fn(),
    };
    render(
      createElement(CdcConnectionCard, {
        controller,
        connectorType: 'POSTGRESQL',
        databaseServiceId: 'source-1',
      }),
    );

    expect(await screen.findByText('CDC connection')).toBeTruthy();
    expect(screen.getByText('Not configured')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Configure CDC' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('Connection URL')).toBeTruthy();
  });

  it('validates and renders safe status without exposing credentials', async () => {
    const profile = {
      id: 'profile-1',
      databaseServiceId: 'source-1',
      connectorType: 'POSTGRESQL',
      endpointSummary: 'db.direct.example.test:5432/postgres',
      setupMode: 'existing' as const,
      verificationStatus: 'untested' as const,
      revision: 0,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    };
    const controller = {
      get: vi.fn().mockResolvedValue(profile),
      save: vi.fn(),
      validate: vi.fn().mockResolvedValue({ ...profile, verificationStatus: 'ready' }),
      remove: vi.fn(),
    };
    render(
      createElement(CdcConnectionCard, {
        controller,
        connectorType: 'POSTGRESQL',
        databaseServiceId: 'source-1',
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Validate CDC' }));
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy());
    expect(document.body.textContent).not.toContain('password');
  });
});

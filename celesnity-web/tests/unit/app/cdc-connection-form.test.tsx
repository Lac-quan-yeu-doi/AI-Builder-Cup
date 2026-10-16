// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CdcConnectionForm } from '@/app/_components/database-service/cdc-connection-form';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('CdcConnectionForm', () => {
  it('submits a write-only connection string without structured connection fields', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      createElement(CdcConnectionForm, {
        connectorType: 'POSTGRESQL',
        onCancel: vi.fn(),
        onSave: save,
      }),
    );

    expect(screen.getByRole('radio', { name: 'Existing setup' }).getAttribute('data-state')).toBe(
      'checked',
    );
    expect(
      screen.getByRole('radio', { name: 'Connection string' }).getAttribute('data-state'),
    ).toBe('checked');
    fireEvent.change(screen.getByLabelText('Connection URL'), {
      target: {
        value: 'postgresql://cdc_user:canary-secret@db.example.test:5432/postgres?sslmode=require',
      },
    });
    fireEvent.change(screen.getByLabelText('Publication'), {
      target: { value: 'celesnity_publication' },
    });
    fireEvent.change(screen.getByLabelText('Replication slot'), {
      target: { value: 'celesnity_slot' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save CDC connection' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      setupMode: 'existing',
      details: {
        connectionUrl:
          'postgresql://cdc_user:canary-secret@db.example.test:5432/postgres?sslmode=require',
      },
      publicationName: 'celesnity_publication',
      slotName: 'celesnity_slot',
    });
    expect((screen.getByLabelText('Connection URL') as HTMLInputElement).value).toBe('');
  });

  it('keeps manual connection fields available and clears the write-only password after save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      createElement(CdcConnectionForm, {
        connectorType: 'POSTGRESQL',
        onCancel: vi.fn(),
        onSave: save,
      }),
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Manual fields' }));
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'db.example.test' } });
    fireEvent.change(screen.getByLabelText('Database'), { target: { value: 'postgres' } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'cdc_user' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'canary-secret' } });
    fireEvent.change(screen.getByLabelText('Publication'), {
      target: { value: 'celesnity_publication' },
    });
    fireEvent.change(screen.getByLabelText('Replication slot'), {
      target: { value: 'celesnity_slot' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save CDC connection' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        setupMode: 'existing',
        details: {
          host: 'db.example.test',
          port: 5432,
          databaseName: 'postgres',
          username: 'cdc_user',
          password: 'canary-secret',
          sslMode: 'require',
        },
      }),
    );
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('requires explicit consent before managed source metadata setup', async () => {
    const save = vi.fn();
    render(
      createElement(CdcConnectionForm, {
        connectorType: 'POSTGRESQL',
        onCancel: vi.fn(),
        onSave: save,
      }),
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Managed setup' }));
    expect(
      (screen.getByRole('button', { name: 'Save CDC connection' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Allow Celesnity to manage CDC metadata/u }),
    );
    expect(
      (screen.getByRole('button', { name: 'Save CDC connection' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

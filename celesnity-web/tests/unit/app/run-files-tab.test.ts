// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { createTranslator } from '@/app/_i18n/translate';
import { RunFilesTab } from '@/app/_components/chat/run-files-tab';
import type { RunFileEntry } from '@/src/entities/models/chat';

const t = createTranslator('en');

const created: RunFileEntry = {
  path: 'a.txt',
  accessType: 'created',
  toolName: 'write_file',
  accessedAt: '2026-01-01T00:00:00.000Z',
  available: true,
  sizeBytes: 5,
};

const readOnly: RunFileEntry = {
  path: 'old.txt',
  accessType: 'read',
  toolName: 'read_file',
  accessedAt: '2026-01-01T00:00:01.000Z',
  available: false,
};

afterEach(cleanup);

describe('RunFilesTab', () => {
  it('renders every file path', () => {
    render(
      createElement(RunFilesTab, {
        state: { status: 'loaded', data: [created, readOnly] },
        onSelectFile: vi.fn(),
        t,
      }),
    );
    expect(screen.getByText('a.txt')).toBeTruthy();
    expect(screen.getByText('old.txt')).toBeTruthy();
  });

  it('shows the created access-type badge label', () => {
    const { container } = render(
      createElement(RunFilesTab, {
        state: { status: 'loaded', data: [created, readOnly] },
        onSelectFile: vi.fn(),
        t,
      }),
    );
    const badges = [...container.querySelectorAll('[data-slot="badge"]')].map(
      (node) => node.textContent,
    );
    expect(badges).toContain(t('chat.runInspector.files.access.created'));
    expect(badges).toContain(t('chat.runInspector.files.access.read'));
  });

  it('calls onSelectFile with the path when an available row is clicked', () => {
    const onSelectFile = vi.fn();
    render(
      createElement(RunFilesTab, {
        state: { status: 'loaded', data: [created, readOnly] },
        onSelectFile,
        t,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /a\.txt/u }));
    expect(onSelectFile).toHaveBeenCalledWith(created);
  });

  it('renders an unavailable row as a non-clickable note that never selects', () => {
    const onSelectFile = vi.fn();
    render(
      createElement(RunFilesTab, {
        state: { status: 'loaded', data: [created, readOnly] },
        onSelectFile,
        t,
      }),
    );
    // The unavailable row is not a button, so there is no clickable control for it.
    expect(screen.queryByRole('button', { name: /old\.txt/u })).toBeNull();
    expect(screen.getByText(t('chat.runInspector.files.unavailable'))).toBeTruthy();
    fireEvent.click(screen.getByText('old.txt'));
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it('filters to read access, hiding created files', () => {
    render(
      createElement(RunFilesTab, {
        state: { status: 'loaded', data: [created, readOnly] },
        onSelectFile: vi.fn(),
        t,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: t('chat.runInspector.files.filter.read') }));
    expect(screen.queryByText('a.txt')).toBeNull();
    expect(screen.getByText('old.txt')).toBeTruthy();
  });

  it('shows the empty state when no files match the filter', () => {
    render(
      createElement(RunFilesTab, {
        state: { status: 'loaded', data: [readOnly] },
        onSelectFile: vi.fn(),
        t,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: t('chat.runInspector.files.filter.created') }),
    );
    expect(screen.getByText(t('chat.runInspector.files.empty'))).toBeTruthy();
  });
});

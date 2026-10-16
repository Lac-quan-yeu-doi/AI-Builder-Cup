// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '@/app/_components/chat/chat-composer';
import { renderUi } from '@/tests/support/render-ui';
import type { ChatAttachment } from '@/src/entities/models/chat-attachment';

afterEach(() => {
  cleanup();
});

describe('ChatComposer attachments', () => {
  it('starts with a supplied draft so a tutorial only requires Send', () => {
    renderUi(
      createElement(ChatComposer, {
        initialValue: 'Save the sales report.',
        onSubmit: vi.fn(),
      }),
    );

    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Save the sales report.');
  });

  it('renders no chip row when there are no attachments', () => {
    renderUi(createElement(ChatComposer, { onSubmit: vi.fn() }));

    expect(screen.queryByText('Revenue by region')).toBeNull();
  });

  it('renders a chip per attachment', () => {
    const attachments: readonly ChatAttachment[] = [
      { type: 'chart', id: 'chart-1', title: 'Revenue by region' },
      { type: 'chart', id: 'chart-2', title: 'Units by region' },
    ];

    renderUi(createElement(ChatComposer, { onSubmit: vi.fn(), attachments }));

    expect(screen.getByText('Revenue by region')).toBeDefined();
    expect(screen.getByText('Units by region')).toBeDefined();
  });

  it('calls onRemoveAttachment with the chip id when its remove control is clicked', () => {
    const onRemoveAttachment = vi.fn();
    const attachments: readonly ChatAttachment[] = [
      { type: 'chart', id: 'chart-1', title: 'Revenue by region' },
    ];

    renderUi(createElement(ChatComposer, { onSubmit: vi.fn(), attachments, onRemoveAttachment }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Revenue by region from this message' }),
    );

    expect(onRemoveAttachment).toHaveBeenCalledWith('chart-1');
  });

  it("still submits the typed text unchanged — attachment merging is the caller's job", () => {
    const onSubmit = vi.fn();
    const attachments: readonly ChatAttachment[] = [
      { type: 'chart', id: 'chart-1', title: 'Revenue by region' },
    ];

    renderUi(createElement(ChatComposer, { onSubmit, attachments }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Explain this' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('Explain this');
  });

  it('opens real capability prompts when slash is typed', () => {
    renderUi(createElement(ChatComposer, { onSubmit: vi.fn() }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/sch' } });

    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeDefined();
    expect(screen.getByRole('option', { name: /Explore my data catalog/i })).toBeDefined();
  });

  it('selects a slash prompt with Enter without submitting it', () => {
    const onSubmit = vi.fn();
    renderUi(createElement(ChatComposer, { onSubmit }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/chart' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(textarea).toHaveProperty('value', 'Create charts and dashboards from my query results.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dismisses slash commands with Escape', () => {
    renderUi(createElement(ChatComposer, { onSubmit: vi.fn() }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '/query' } });
    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeDefined();

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).toBeNull();
  });
});

describe('ChatComposer compact follow-up surface', () => {
  it('uses the supplied continuation placeholder without rendering expanded keyboard hints', () => {
    renderUi(
      createElement(ChatComposer, {
        compact: true,
        onSubmit: vi.fn(),
        placeholder: 'Answer to carry on',
      }),
    );

    expect(screen.getByPlaceholderText('Answer to carry on')).toBeDefined();
    expect(screen.queryByText('send', { exact: true })).toBeNull();
    expect(screen.queryByText('new line', { exact: true })).toBeNull();
  });
});

it('provides an accessible attachment menu that closes on Escape and restores focus', () => {
  renderUi(
    createElement(ChatComposer, {
      compact: true,
      onSubmit: vi.fn(),
      onFileAttach: vi.fn(),
    }),
  );

  const trigger = screen.getByRole('button', { name: 'Add to message' });
  fireEvent.click(trigger);

  const menu = screen.getByRole('menu');
  expect(screen.getByRole('menuitem', { name: 'Attach a file' })).toBeDefined();
  fireEvent.keyDown(menu, { key: 'Escape' });

  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

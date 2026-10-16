// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import {
  assistantPanelDefaultWidth,
  assistantPanelMaxWidth,
  assistantPanelMinWidth,
  clampAssistantPanelWidth,
  useAssistantPanelStore,
} from '@/app/_stores/assistant-panel.store';

const { getInjection } = vi.hoisted(() => ({
  getInjection: vi.fn((key: string) => {
    if (key === 'ListPendingActionsController') return vi.fn().mockResolvedValue([]);
    if (key === 'ResolveCitationsController') return vi.fn().mockResolvedValue([]);
    return vi.fn();
  }),
}));

vi.mock('@/di/container', () => ({ getInjection }));

import { AssistantPanel } from '@/app/_components/assistant/assistant-panel';

const controllers = {
  resolveCitations: vi.fn().mockResolvedValue([]),
  listPendingActions: vi.fn().mockResolvedValue([]),
  approvePendingAction: vi.fn(),
  rejectPendingAction: vi.fn(),
} as unknown as Parameters<typeof AssistantPanel>[0]['controllers'];

function renderPanel(overrides: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  renderUi(
    createElement(AssistantPanel, {
      controllers,
      emptyDescription: 'It reads the tables in this database.',
      emptyTitle: 'Ask about this database',
      isStreaming: false,
      messages: [],
      onSubmit,
      surface: 'test-surface',
      title: 'Database assistant',
      ...overrides,
    }),
  );
  return { onSubmit };
}

afterEach(() => {
  cleanup();
  useAssistantPanelStore.setState({ widths: {}, openOverrides: {} });
  window.localStorage.clear();
});

describe('assistant panel width', () => {
  it('holds the platform width inside the range a drag may reach', () => {
    expect(clampAssistantPanelWidth(assistantPanelDefaultWidth)).toBe(400);
    expect(clampAssistantPanelWidth(10)).toBe(assistantPanelMinWidth);
    expect(clampAssistantPanelWidth(5000)).toBe(assistantPanelMaxWidth);
    expect(clampAssistantPanelWidth(Number.NaN)).toBe(assistantPanelDefaultWidth);
  });

  it('resizes from the keyboard, because a separator only a pointer can reach is half a control', () => {
    renderPanel();
    const handle = screen.getByRole('separator');

    // Dragging left widens the panel, so the left arrow does too.
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(useAssistantPanelStore.getState().widths['test-surface']).toBe(
      assistantPanelDefaultWidth + 16,
    );

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(useAssistantPanelStore.getState().widths['test-surface']).toBe(
      assistantPanelDefaultWidth,
    );

    fireEvent.keyDown(handle, { key: 'End' });
    expect(useAssistantPanelStore.getState().widths['test-surface']).toBe(assistantPanelMaxWidth);

    fireEvent.keyDown(handle, { key: 'Home' });
    expect(useAssistantPanelStore.getState().widths['test-surface']).toBe(assistantPanelMinWidth);
  });

  it('keeps one width per surface', () => {
    useAssistantPanelStore.getState().setWidth('skills', 520);
    useAssistantPanelStore.getState().setWidth('database', 340);

    expect(useAssistantPanelStore.getState().widths).toEqual({ skills: 520, database: 340 });
  });

  it('discards a stored width outside the range', () => {
    const merged = useAssistantPanelStore.persist.getOptions().merge?.(
      { widths: { skills: 9000, database: 420 }, openOverrides: { skills: 'yes' } },
      {
        ...useAssistantPanelStore.getState(),
      },
    );

    expect((merged as { widths: Record<string, number> }).widths).toEqual({ database: 420 });
    expect((merged as { openOverrides: Record<string, boolean> }).openOverrides).toEqual({});
  });
});

describe('assistant panel chrome', () => {
  it('states what the assistant can see', () => {
    renderPanel({
      scope: [
        { id: 'database', kind: 'database', value: 'factory_silver' },
        { id: 'table', kind: 'table', value: 'press_telemetry' },
      ],
    });

    const scope = screen.getByRole('group', { name: 'What the assistant can see' });
    expect(scope.textContent).toContain('factory_silver');
    expect(scope.textContent).toContain('press_telemetry');
  });

  it('takes a chip off when the visitor narrows the scope', () => {
    const onScopeRemove = vi.fn();
    renderPanel({
      onScopeRemove,
      scope: [{ id: 'table', kind: 'table', value: 'press_telemetry', removable: true }],
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove press_telemetry from what the assistant reads',
      }),
    );
    expect(onScopeRemove).toHaveBeenCalledWith('table');
  });

  it('opens on a scoped brief rather than the full chat landing', () => {
    renderPanel({
      starters: [{ id: 'tables', label: 'What is in this database?', prompt: 'list the tables' }],
    });

    expect(screen.getByRole('heading', { name: 'Ask about this database' })).toBeTruthy();
    // The /chat hero belongs to a full-width surface; in a 400px column it
    // used to cover the page heading behind it.
    expect(screen.queryByText(/What can I help you analyze/i)).toBeNull();
  });

  it('sends a starter as the first message', () => {
    const { onSubmit } = renderPanel({
      starters: [{ id: 'tables', label: 'What is in this database?', prompt: 'list the tables' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'What is in this database?' }));
    expect(onSubmit).toHaveBeenCalledWith('list the tables');
  });

  it('names the assistant once', () => {
    renderPanel({ emptyTitle: 'Ask about this database', title: 'Database assistant' });

    expect(screen.getAllByRole('heading', { name: 'Database assistant' })).toHaveLength(1);
  });

  it('closes on Escape, the way a sheet has to', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('reports a failed run in the panel rather than in the console', () => {
    renderPanel({ error: 'The query could not be run.' });

    expect(screen.getByRole('alert').textContent).toContain('The query could not be run.');
  });

  it('offers the full surface without starting the conversation again', () => {
    renderPanel({ openInChatHref: '/chat?database=factory_silver' });

    expect(screen.getByRole('link', { name: 'Open in Chat' }).getAttribute('href')).toBe(
      '/chat?database=factory_silver',
    );
  });
});

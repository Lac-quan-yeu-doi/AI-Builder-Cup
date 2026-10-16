// @vitest-environment jsdom

/* eslint-disable react/no-children-prop --
 * Tests are plain .ts files, so elements are built with createElement. Passing
 * children through props keeps the required `children` prop type-checked. */

import { createElement, useState, type ChangeEvent } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceShell } from '@/app/_components/layout/workspace-shell';
import { defaultLocale } from '@/app/_i18n/locales';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
import { useLocaleStore } from '@/app/_stores/locale.store';
import { useSidebarStore } from '@/app/_stores/sidebar.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import { renderUi as render } from '@/tests/support/render-ui';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: Record<string, unknown> & { children?: unknown }) =>
    createElement(
      'a',
      {
        href,
        ...rest,
        onClick: (event: { preventDefault: () => void }) => event.preventDefault(),
      },
      children as never,
    ),
}));

const pathname = vi.hoisted(() => ({ current: '/catalog/databases' }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const listSessions = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const authController = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  beginPasswordChange: vi.fn(async () => ({ kind: 'mfa-required' as const })),
  completePasswordChange: vi.fn(async () => undefined),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => router,
}));

vi.mock('@/di/container', () => ({
  getInjection: (token: string) => {
    if (token === 'ManageChatController') return { listSessions };
    if (token === 'AuthController') return authController;
    return vi.fn();
  },
}));

// Surface rendering belongs to task 19.1. These tests isolate shell persistence
// and the entry-to-store interaction from that concurrently changing host.
vi.mock('@/app/_components/tutorials/tutorial-overlay-host', () => ({
  TutorialOverlayHost: () => null,
}));

function StatefulDestination() {
  const [draft, setDraft] = useState('');

  return createElement(
    'section',
    { 'aria-label': 'Current destination' },
    createElement('label', { htmlFor: 'destination-draft' }, 'Destination draft'),
    createElement('input', {
      id: 'destination-draft',
      onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.currentTarget.value),
      value: draft,
    }),
    createElement(
      'div',
      { 'data-testid': 'destination-scroll', style: { height: 20, overflow: 'auto' } },
      createElement('div', { style: { height: 400 } }, 'Scrollable destination content'),
    ),
  );
}

function resetTutorialSession(): void {
  useTutorialSessionStore.setState({
    openSurface: 'none',
    activeRunId: null,
    catalogView: { search: '', filters: [], scrollTop: 0 },
  });
}

afterEach(() => {
  cleanup();
  pathname.current = '/catalog/databases';
  router.push.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
  listSessions.mockReset().mockResolvedValue([]);
  useLocaleStore.setState({ locale: defaultLocale });
  useSidebarStore.setState({ collapsed: false });
  useChatSessionsStore.setState({ sessions: [], activeSessionId: null, hydrated: false });
  resetTutorialSession();
});

describe('workspace tutorial entry', () => {
  it('keeps the tutorial entry available across workspace destinations', () => {
    const view = render(
      createElement(WorkspaceShell, {
        children: createElement('p', null, 'Database destination'),
      }),
    );

    expect(screen.getByRole('button', { name: 'Open guided tutorials' })).toBeTruthy();

    pathname.current = '/streaming';
    view.rerender(
      createElement(WorkspaceShell, {
        children: createElement('p', null, 'Streaming destination'),
      }),
    );

    expect(screen.getByRole('button', { name: 'Open guided tutorials' })).toBeTruthy();
  });

  it('opens the catalog without replacing or resetting visible destination state', () => {
    render(createElement(WorkspaceShell, { children: createElement(StatefulDestination) }));

    const destination = screen.getByRole('region', { name: 'Current destination' });
    const draft = screen.getByRole('textbox', { name: 'Destination draft' });
    const scrollRegion = screen.getByTestId('destination-scroll');

    fireEvent.change(draft, { target: { value: 'unsaved destination work' } });
    scrollRegion.scrollTop = 180;
    fireEvent.click(screen.getByRole('button', { name: 'Open guided tutorials' }));

    expect(useTutorialSessionStore.getState().openSurface).toBe('catalog');
    expect(screen.getByRole('region', { name: 'Current destination' })).toBe(destination);
    const preservedDraft = screen.getByRole('textbox', {
      name: 'Destination draft',
    }) as HTMLInputElement;
    expect(preservedDraft.value).toBe('unsaved destination work');
    expect(screen.getByTestId('destination-scroll').scrollTop).toBe(180);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each(['catalog', 'detail', 'walkthrough'] as const)(
    'reserves the same desktop workspace width while the %s is open',
    (openSurface) => {
      useTutorialSessionStore.setState({ openSurface });
      const { container } = render(
        createElement(WorkspaceShell, { children: createElement('p', null, 'Query workspace') }),
      );

      const workspace = container.querySelector('[data-workspace-content]');
      expect(workspace?.classList.contains('min-[1024px]:mr-[24rem]')).toBe(true);
    },
  );
});

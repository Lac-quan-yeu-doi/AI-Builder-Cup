// @vitest-environment jsdom

/* eslint-disable react/no-children-prop --
 * Tests are plain .ts files, so elements are built with createElement. Passing
 * children through props keeps the required `children` prop type-checked. */

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { cn } from '@/app/_components/ui/utils';
import { WorkspaceShell } from '@/app/_components/layout/workspace-shell';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import { useSidebarStore } from '@/app/_stores/sidebar.store';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: Record<string, unknown> & { children?: unknown }) =>
    createElement(
      'a',
      {
        href,
        ...rest,
        onClick: (event: { preventDefault: () => void }) => {
          event.preventDefault();
          (rest.onClick as (() => void) | undefined)?.();
        },
      },
      children as never,
    ),
}));

const pathname = vi.hoisted(() => ({ current: '/database-services' }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const authController = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  beginPasswordChange: vi.fn(async () => ({ kind: 'mfa-required' as const })),
  completePasswordChange: vi.fn(async () => undefined),
}));
const catalogControllers = vi.hoisted(() => ({
  ListCatalogsController: vi.fn(async () => [
    { name: 'iceberg', jdbcCatalogIdentity: 'celesnity' },
  ]),
  ListNamespacesController: vi.fn(async () => [{ catalog: 'iceberg', name: 'demo' }]),
  CreateNamespaceController: vi.fn(async () => ({ catalog: 'iceberg', name: 'hi' })),
}));
// The chat sessions store hydrates from this (see chat-sessions.store.ts) —
// a conversation Recents should show has to come from here, not from
// seeding storage: the store no longer caches anything locally.
const listSessions = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => router,
}));

vi.mock('@/di/container', () => ({
  getInjection: (token: string) =>
    token === 'ManageChatController'
      ? { listSessions }
      : token in catalogControllers
        ? catalogControllers[token as keyof typeof catalogControllers]
        : authController,
}));

afterEach(() => {
  cleanup();
  pathname.current = '/database-services';
  listSessions.mockReset().mockResolvedValue([]);
  authController.signOut.mockReset();
  authController.signOut.mockResolvedValue(undefined);
  authController.beginPasswordChange.mockReset();
  authController.beginPasswordChange.mockResolvedValue({ kind: 'mfa-required' });
  authController.completePasswordChange.mockReset();
  authController.completePasswordChange.mockResolvedValue(undefined);
  router.push.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
  useLocaleStore.setState({ locale: defaultLocale });
  useSidebarStore.setState({ collapsed: false });
  useChatSessionsStore.setState({ sessions: [], activeSessionId: null, hydrated: false });
});

describe('app-wide ui primitives', () => {
  it('drops falsy class names', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('renders a button that defaults to type=button and forwards clicks', () => {
    const onClick = vi.fn();
    render(createElement(Button, { children: 'Run', onClick }));

    const button = screen.getByRole('button', { name: 'Run' });
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire clicks while disabled', () => {
    const onClick = vi.fn();
    render(
      createElement(Button, {
        children: 'Archive',
        disabled: true,
        onClick,
        variant: 'destructive',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a card surface as the requested element with an accessible name', () => {
    const { unmount } = render(createElement(Card, { children: 'body' }));
    expect(screen.getByText('body').tagName).toBe('DIV');
    unmount();

    // Half the workspace panels are landmarks, which `asChild` preserves.
    render(
      createElement(
        Card,
        { asChild: true },
        createElement('aside', { 'aria-label': 'Connection editor' }, 'body'),
      ),
    );
    expect(screen.getByRole('complementary', { name: 'Connection editor' })).toBeTruthy();
  });

  it('carries the workspace status tones on the shared badge', () => {
    const { unmount } = render(createElement(Badge, { children: 'Succeeded', variant: 'success' }));
    const succeeded = screen.getByText('Succeeded');
    expect(succeeded.className).toContain('bg-status-success-light');
    expect(succeeded.getAttribute('data-variant')).toBe('success');
    unmount();

    render(createElement(Badge, { children: 'Failed', variant: 'danger' }));
    expect(screen.getByText('Failed').className).toContain('bg-destructive/10');
  });
});

describe('workspace shell localization', () => {
  it('renders navigation in the active locale and switches language', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    // Four groups of containers and workspace-level tools — not a flat list of
    // every screen the product has.
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Home$/ }).getAttribute('href')).toBe('/chat');
    expect(screen.getByRole('link', { name: /^Databases$/ }).getAttribute('href')).toBe(
      '/catalog/databases',
    );
    expect(screen.getByRole('link', { name: /^Streaming$/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Plant model$/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Analytics$/ })).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Data Workflows$/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Automations$/ }).getAttribute('href')).toBe(
      '/automations',
    );
    expect(screen.getByText('Resources')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Documents$/ })).toBeTruthy();
    // Query, Skills and Guide sit outside the six capabilities and are paused.
    expect(screen.queryByRole('link', { name: /^Query$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Skills$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Guide$/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));

    expect(useLocaleStore.getState().locale).toBe('vi');
    expect(screen.getByText('Dữ liệu')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Cơ sở dữ liệu$/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Streaming$/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Luồng dữ liệu$/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Tự động hóa$/ }).getAttribute('href')).toBe(
      '/automations',
    );
    expect(screen.getByText('Tài nguyên')).toBeTruthy();
    expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe(
      'Điều hướng không gian làm việc',
    );
  });

  it('exposes the language toggle as a labelled group with one pressed option', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    const group = screen.getByRole('group', { name: 'Language' });
    const english = screen.getByRole('button', { name: 'English' });
    const vietnamese = screen.getByRole('button', { name: 'Tiếng Việt' });

    expect(group.contains(english)).toBe(true);
    expect(english.getAttribute('aria-pressed')).toBe('true');
    expect(vietnamese.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(vietnamese);

    // The group re-labels itself in the new locale and moves the pressed state.
    expect(screen.getByRole('group', { name: 'Ngôn ngữ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tiếng Việt' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('keeps the header free of the environment chip', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    expect(screen.queryByText('Local development')).toBeNull();
  });
});

describe('workspace shell header navigation', () => {
  it('changes an MFA account password and returns to sign in', async () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    // jsdom has no PointerEvent, so the Radix trigger is opened the way a
    // keyboard user opens it — the same path the other dropdown tests pin.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change password' }));

    fireEvent.change(await screen.findByLabelText(/^Email/u), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Current password/u), {
      target: { value: 'current-password' },
    });
    fireEvent.change(screen.getByLabelText(/^New password/u), {
      target: { value: 'new-password-value' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/u), {
      target: { value: 'new-password-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(authController.beginPasswordChange).toHaveBeenCalledWith({
        email: 'user@example.com',
        currentPassword: 'current-password',
        newPassword: 'new-password-value',
        confirmPassword: 'new-password-value',
      }),
    );
    fireEvent.change(await screen.findByLabelText(/^Authenticator code/u), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(authController.completePasswordChange).toHaveBeenCalledWith({
        code: '123456',
        newPassword: 'new-password-value',
      }),
    );
    expect(router.replace).toHaveBeenCalledWith('/login?passwordChanged=1');
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('signs out from the account menu and returns to login', async () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    // jsdom has no PointerEvent, so the Radix trigger is opened the way a
    // keyboard user opens it — the same path the other dropdown tests pin.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(authController.signOut).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the workspace open and reports a sign-out failure', async () => {
    authController.signOut.mockRejectedValueOnce(new Error('unavailable'));
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    // jsdom has no PointerEvent, so the Radix trigger is opened the way a
    // keyboard user opens it — the same path the other dropdown tests pin.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Account menu' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Sign-out could not be completed. Please try again.',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('marks only the link for the current route as the current page', () => {
    pathname.current = '/catalog/databases';
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    expect(screen.getByRole('link', { name: /Databases/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: /Streaming/ }).getAttribute('aria-current')).toBeNull();
  });

  it('leaves every destination unmarked inside a container the rail does not list', () => {
    // `/databases/[name]` is where a database's own tabs live. It is reached
    // through the Databases destination but is not one itself, so nothing in the
    // rail should claim to be the current page.
    pathname.current = '/databases/analytics';
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    expect(screen.getByRole('link', { name: /Databases/ }).getAttribute('aria-current')).toBeNull();
  });

  it('toggles the narrow-screen menu and keeps one navigation in the accessibility tree', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('workspace-navigation');

    fireEvent.click(toggle);

    const close = screen.getByRole('button', { name: 'Close navigation' });
    expect(close.getAttribute('aria-expanded')).toBe('true');
    // The same nav element serves both widths, so every label stays reachable
    // and no link is duplicated into a second menu.
    expect(screen.getAllByRole('navigation').length).toBe(1);
    expect(screen.getAllByRole('link', { name: /Automations/ }).length).toBe(1);

    fireEvent.click(close);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
  });

  it('closes the menu once a destination is chosen', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeTruthy();

    // Navigating does not unmount the shell, so the link closes the menu itself.
    fireEvent.click(screen.getByRole('link', { name: /Automations/ }));

    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
  });

  it('closes the menu on Escape', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
  });
});

describe('workspace sidebar collapse', () => {
  it('collapses to the icon rail and back from the header control', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(useSidebarStore.getState().collapsed).toBe(true);
    // Collapsing hides the label above 761px only, so the link keeps its
    // accessible name and stays reachable from the icon rail.
    expect(screen.getByRole('link', { name: /Databases/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('toggles the rail with the keyboard shortcut', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(useSidebarStore.getState().collapsed).toBe(true);

    fireEvent.keyDown(window, { key: 'B', ctrlKey: true });
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('groups the destinations instead of listing every one as a peer', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    const navigation = screen.getByRole('navigation');
    expect(navigation.textContent).toContain('Data');
    expect(navigation.textContent).toContain('Tools');
    expect(navigation.textContent).toContain('Resources');
  });

  it('offers nine destinations including plugins and Data Workflows', () => {
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    // The rail is narrowed to the six-capability workspace: Query, Scripts,
    // Skills, Guide and Administration are paused in `route-features.ts`.
    // Plugins and Data Workflows remain independent tools with direct routes.
    const links = screen.getByRole('navigation').querySelectorAll('a');
    expect(links.length).toBe(9);
    expect(screen.getByRole('link', { name: /^Plugins$/ }).getAttribute('href')).toBe('/plugins');
    expect(screen.getByRole('link', { name: /^Data Workflows$/ }).getAttribute('href')).toBe(
      '/data-workflows',
    );
  });
});

describe('workspace database rail', () => {
  it('carries no write action', async () => {
    // The rail is visible on every screen in the product, and a `+` lived in it
    // that opened the same dialog `/catalog/databases` already offers — as the
    // copy without the guard, so before catalogs loaded it was a dead click.
    // Creating a database is a one-off act; it belongs on the page that lists
    // them, not in permanent chrome.
    render(createElement(WorkspaceShell, { children: createElement('p', null, 'page') }));

    await screen.findByRole('link', { name: 'Databases' });
    expect(screen.queryByRole('button', { name: 'Create a database' })).toBeNull();
  });
});

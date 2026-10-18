'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/app/_components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { cn } from '@/app/_components/ui/utils';
import { LogOutIcon, MenuIcon, PanelLeftIcon, ShieldIcon, XIcon } from 'lucide-react';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useSidebarStore } from '@/app/_stores/sidebar.store';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import { useCurrentUserId } from '@/app/_providers/current-user-provider';
import { useWorkspaceAccess } from '@/app/_providers/workspace-access-provider';
import { getInjection } from '@/di/container';

import { LanguageSwitcher } from './language-switcher';
import { AccountPasswordDialog } from './account-password-dialog';
import { isFullscreenWorkspaceRoute } from './workspace-shell-route';
import {
  workspaceFooterNavigation,
  canAccessWorkspaceFeature,
  firstVisibleWorkspaceDestination,
  visibleWorkspaceNavigationGroups,
  workspaceFeatureForPath,
  type WorkspaceNavigationItem,
} from './workspace-navigation';
import { LogoMark } from './logo-mark';

interface WorkspaceShellProps {
  readonly children: ReactNode;
}

const navigationId = 'workspace-navigation';

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar shell. One `<aside>` serves both widths — a left-edge overlay below
 * 761px, a persistent rail above it — so no destination is duplicated into a
 * second menu for assistive technology to read twice.
 *
 * Above 761px the rail collapses to icons (⌘B / Ctrl+B). Collapsing is a CSS
 * concern rather than a JavaScript one: the labels carry `md:hidden`
 * while collapsed, which leaves the overlay at full width on a narrow screen
 * even when the desktop rail was left collapsed.
 */
export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const userId = useCurrentUserId();
  const workspaceAccess = useWorkspaceAccess();
  const authController = getInjection('AuthController');
  const collapsed = useSidebarStore((state) => state.collapsed);
  const tutorialSurface = useTutorialSessionStore((state) => state.openSurface);
  const tutorialExperience = useTutorialSessionStore((state) => state.activeExperience);
  const tutorialPanelDocked =
    tutorialSurface === 'catalog' ||
    tutorialSurface === 'detail' ||
    tutorialSurface === 'walkthrough';
  const toggleCollapsed = useSidebarStore((state) => state.toggle);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      await authController.signOut();
      router.replace('/login');
      router.refresh();
    } catch {
      setSignOutFailed(true);
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    void useSidebarStore.persist.rehydrate();
    if (tutorialExperience?.mode === 'SIMULATED_CHAT') return;
    // The sidebar lists conversations on every route, so it cannot wait for
    // the chat screen to load them — on `/databases/demo` that screen is not
    // mounted, and the history under each database came up empty.
    useChatSessionsStore.getState().hydrate(userId);
  }, [tutorialExperience, userId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCollapsed]);

  const visibleFeatures =
    workspaceAccess.status === 'ready' ? workspaceAccess.visibleFeatures : ([] as const);
  const visibleGroups = visibleWorkspaceNavigationGroups(visibleFeatures);
  const visibleFooter = workspaceFooterNavigation.filter((item) =>
    canAccessWorkspaceFeature(visibleFeatures, item.feature),
  );
  const requiredFeature = workspaceFeatureForPath(pathname);
  const routeAllowed =
    requiredFeature === undefined || canAccessWorkspaceFeature(visibleFeatures, requiredFeature);
  const firstDestination = firstVisibleWorkspaceDestination(visibleFeatures);

  if (isFullscreenWorkspaceRoute(pathname) && routeAllowed && workspaceAccess.status === 'ready') {
    return (
      <>
        <main
          className={cn(
            'min-h-screen min-w-0 bg-background transition-[margin] duration-200',
            tutorialPanelDocked && 'min-[1024px]:mr-[24rem]',
          )}
          data-workspace-content=""
        >
          {children}
        </main>
      </>
    );
  }

  const guardedContent =
    workspaceAccess.status !== 'ready' ? (
      <section className="grid min-h-[60vh] place-content-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">{t('workspaceAccess.unavailableTitle')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('workspaceAccess.unavailableDescription')}
        </p>
        <Button
          aria-busy={workspaceAccess.status === 'loading'}
          className="mx-auto"
          disabled={workspaceAccess.status === 'loading'}
          onClick={() => void workspaceAccess.reload()}
        >
          {t('action.retry')}
        </Button>
      </section>
    ) : !routeAllowed ? (
      <section className="grid min-h-[60vh] place-content-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">{t('workspaceAccess.deniedTitle')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('workspaceAccess.deniedDescription')}
        </p>
        {firstDestination ? (
          <Button asChild className="mx-auto">
            <Link href={firstDestination.href}>{t(firstDestination.labelKey)}</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t('workspaceAccess.noFeatures')}</p>
        )}
      </section>
    ) : (
      children
    );

  const renderLink = (item: WorkspaceNavigationItem, nested = false) => {
    const current = isCurrent(pathname, item.href);
    const NavIcon = item.icon;
    const label = t(item.labelKey);

    return (
      <Link
        aria-current={current ? 'page' : undefined}
        aria-label={label}
        className={cn(
          'flex min-h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-body-sm focus-visible:outline-none',
          // Darker ink on a darker row, not a second colour: the rail is a
          // list of places, and one of them being blue reads as a status
          // rather than as "you are here".
          current
            ? 'bg-sidebar-selected font-[650] text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground',
          collapsed && 'md:justify-center md:px-0',
          nested && 'ml-3',
          nested && collapsed && 'md:ml-0',
        )}
        href={item.href}
        key={item.href}
        onClick={() => setMenuOpen(false)}
        title={label}
      >
        <NavIcon
          className={cn('shrink-0', current ? 'text-foreground' : 'text-muted-foreground')}
          size={19}
        />
        <span className={cn('truncate', collapsed && 'md:hidden')}>{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[268px] flex-col border-r border-border bg-sidebar',
          menuOpen ? 'flex' : 'hidden',
          'md:sticky md:top-0 md:z-auto md:flex md:h-screen',
          collapsed ? 'md:w-14' : 'md:w-[268px]',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-3">
          <Link
            aria-label={t('brand.homeLabel')}
            className={cn(
              'flex min-w-0 shrink items-center gap-2.5',
              // A 56px rail cannot hold the mark and the control side by side,
              // so the control takes the row and doubles as the way back.
              collapsed && 'md:hidden',
            )}
            href={firstDestination?.href ?? '/'}
          >
            {/* Decorative: the link is already named by `brand.homeLabel` and
             * the wordmark beside it, so a label here would be read twice. */}
            <LogoMark className="size-[26px] shrink-0 rounded-lg" />
            <strong
              className={cn('truncate text-body-sm tracking-[-0.01em]', collapsed && 'md:hidden')}
            >
              {t('brand.name')}
            </strong>
          </Link>

          <button
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className={cn(
              'hidden size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground md:grid',
              collapsed ? 'md:mx-auto' : 'md:ml-auto',
            )}
            onClick={toggleCollapsed}
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            type="button"
          >
            <PanelLeftIcon size={19} />
          </button>

          <button
            aria-controls={navigationId}
            aria-expanded={menuOpen}
            aria-label={t('nav.closeMenu')}
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            <XIcon size={20} />
          </button>
        </div>

        <nav
          aria-label={t('nav.label')}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2"
          id={navigationId}
        >
          {visibleGroups.map((group, index) => (
            <div
              className={cn('grid gap-0.5', group.isolated && 'mt-3 border-y border-border py-3')}
              key={group.labelKey ?? `group-${index}`}
            >
              {group.labelKey ? (
                <span
                  className={cn(
                    'px-2.5 pt-3.5 pb-1 text-micro font-[650] tracking-[0.07em] text-muted-foreground uppercase',
                    collapsed && 'md:hidden',
                  )}
                >
                  {t(group.labelKey)}
                </span>
              ) : null}
              {group.sections?.map((section) => (
                <div className="grid gap-0.5" key={section.labelKey}>
                  <span
                    className={cn(
                      'px-3 pt-2 pb-0.5 text-caption font-[650] text-foreground',
                      collapsed && 'md:hidden',
                    )}
                  >
                    {t(section.labelKey)}
                  </span>
                  {section.items.map((item) => renderLink(item, true))}
                </div>
              ))}
              {group.items.map((item) => (
                <div className="grid gap-0.5" key={item.href}>
                  {renderLink(item)}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="grid shrink-0 gap-2 border-t border-border p-2">
          {visibleFooter.map((item) => renderLink(item))}

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t('shell.accountMenu')}
                  className="size-8 shrink-0 rounded-full border-status-warning/40 bg-status-warning-light text-status-warning-dark hover:bg-status-warning-light hover:text-status-warning-dark"
                  disabled={signingOut}
                  size="icon"
                  title={t('shell.accountMenu')}
                  variant="outline"
                >
                  <ShieldIcon size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem onSelect={() => setPasswordDialogOpen(true)}>
                  {t('auth.changePassword')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut()}>
                  <LogOutIcon size={18} />
                  {signingOut ? t('auth.signingOut') : t('auth.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* The switcher is wider than the 56px rail, and changing locale
             * from a collapsed rail is not a thing anyone does mid-task — one
             * click reopens it. */}
            <span className={cn(collapsed && 'md:hidden')}>
              <LanguageSwitcher />
            </span>
          </div>
        </div>
      </aside>

      <AccountPasswordDialog
        begin={(input) => authController.beginPasswordChange(input)}
        complete={(code, newPassword) =>
          authController.completePasswordChange({ code, newPassword })
        }
        onChanged={() => {
          setPasswordDialogOpen(false);
          router.replace('/login?passwordChanged=1');
          router.refresh();
        }}
        onClose={() => setPasswordDialogOpen(false)}
        opened={passwordDialogOpen}
      />

      {menuOpen ? (
        <button
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-foreground/20 md:hidden"
          onClick={() => setMenuOpen(false)}
          tabIndex={-1}
          type="button"
        />
      ) : null}

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-[margin] duration-200',
          tutorialPanelDocked && 'min-[1024px]:mr-[24rem]',
        )}
        data-workspace-content=""
      >
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/[0.68] px-4 backdrop-blur-[12px] md:hidden">
          <button
            aria-controls={navigationId}
            aria-expanded={menuOpen}
            aria-label={t('nav.openMenu')}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            <MenuIcon size={20} />
          </button>
          <strong className="text-body-md tracking-[-0.01em]">{t('brand.name')}</strong>
        </header>

        {signOutFailed ? (
          <p
            className="mx-4 mt-3 max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            {t('auth.signOutError')}
          </p>
        ) : null}

        <main className="min-w-0 flex-1">{guardedContent}</main>
      </div>
    </div>
  );
}

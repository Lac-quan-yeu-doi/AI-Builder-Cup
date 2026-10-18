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
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftIcon,
  XIcon,
} from 'lucide-react';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useSidebarStore } from '@/app/_stores/sidebar.store';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import { useCurrentUserId } from '@/app/_providers/current-user-provider';
import { useWorkspaceAccess } from '@/app/_providers/workspace-access-provider';
import { TutorialEntry } from '@/app/_components/tutorials/tutorial-entry';
import { TutorialOverlayHost } from '@/app/_components/tutorials/tutorial-overlay-host';
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
import { PlantRail, plantSiteFromPath } from './plant-rail';
import { RAIL_CURRENT, RAIL_IDLE } from './rail-styles';

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
  // Groups the user folded this visit; every group starts open.
  const [foldedGroups, setFoldedGroups] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string) =>
    setFoldedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
  // Inside a plant the rail becomes the plant's own navigation (see plant-rail).
  const plantSiteId = routeAllowed ? plantSiteFromPath(pathname) : undefined;

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
        <TutorialEntry />
        <TutorialOverlayHost />
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
          'relative flex min-h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-body-sm focus-visible:outline-none',
          current ? RAIL_CURRENT : RAIL_IDLE,
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
    <div className="flex min-h-screen bg-background">
      {/* The rail is the dark theme, scoped: `dark` flips every token under
          it, so the switcher, avatar and language menu follow without a
          second palette. Above md it runs 12px under the page sheet, so the
          sheet's rounded corners show the rail and not the page behind it. */}
      <aside
        className={cn(
          'dark fixed inset-y-0 left-0 z-50 w-[268px] flex-col bg-sidebar text-foreground',
          menuOpen ? 'flex' : 'hidden',
          'md:sticky md:top-0 md:z-auto md:flex md:h-screen md:pr-3',
          collapsed ? 'md:w-[68px]' : 'md:w-[280px]',
        )}
      >
        <div className="flex shrink-0 items-center gap-1 px-2 pt-2 pb-1">
          <Link
            aria-label={t('brand.homeLabel')}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-sidebar-accent',
              // A 56px rail cannot hold the mark and the control side by side,
              // so the control takes the row and doubles as the way back.
              collapsed && 'md:hidden',
            )}
            href={firstDestination?.href ?? '/'}
          >
            {/* Decorative: the link is already named by `brand.homeLabel` and
             * the wordmark beside it, so a label here would be read twice. */}
            <LogoMark className="size-8 shrink-0 rounded-lg" />
            <span className="grid min-w-0">
              <strong className="truncate text-body-sm tracking-[-0.01em]">
                {t('brand.name')}
              </strong>
              <span className="truncate text-micro text-muted-foreground">
                {t('brand.tagline')}
              </span>
            </span>
          </Link>

          <button
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className={cn(
              'hidden size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:grid',
              collapsed && 'md:mx-auto',
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
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:hidden"
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
          {plantSiteId !== undefined ? (
            <PlantRail
              siteId={plantSiteId}
              collapsed={collapsed}
              onNavigate={() => setMenuOpen(false)}
            />
          ) : null}
          {plantSiteId === undefined &&
            visibleGroups.map((group, index) => {
              const folded =
                group.labelKey !== undefined && foldedGroups.has(group.labelKey) && !collapsed;
              return (
                <div
                  className={cn(
                    'grid gap-0.5',
                    group.isolated && 'mt-3 border-y border-sidebar-border py-3',
                  )}
                  key={group.labelKey ?? `group-${index}`}
                >
                  {group.labelKey ? (
                    <button
                      type="button"
                      aria-expanded={!folded}
                      onClick={() => toggleGroup(group.labelKey ?? '')}
                      className={cn(
                        'group/heading flex items-center gap-1 rounded-md px-2.5 pt-4 pb-1 text-left font-mono text-micro tracking-[0.12em] text-muted-foreground/70 uppercase hover:text-foreground',
                        collapsed && 'md:hidden',
                      )}
                    >
                      {t(group.labelKey)}
                      <ChevronDownIcon
                        aria-hidden
                        size={12}
                        className={cn(
                          'opacity-0 transition-transform group-hover/heading:opacity-100',
                          folded && '-rotate-90 opacity-100',
                        )}
                      />
                    </button>
                  ) : null}
                  {folded ? null : (
                    <>
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
                    </>
                  )}
                </div>
              );
            })}
        </nav>

        <div className="grid shrink-0 gap-1.5 border-t border-sidebar-border p-2">
          {visibleFooter.map((item) => renderLink(item))}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('shell.accountMenu')}
                title={t('shell.accountMenu')}
                disabled={signingOut}
                className={cn(
                  'flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent',
                  collapsed && 'md:justify-center md:px-0',
                )}
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-ring text-micro font-[650] text-primary-foreground uppercase"
                >
                  {userId.replace(/[^a-z0-9]/giu, '').slice(0, 2) || '?'}
                </span>
                <span className={cn('grid min-w-0 flex-1', collapsed && 'md:hidden')}>
                  <span className="truncate text-body-sm font-[650]">{userId}</span>
                  <span className="truncate text-micro text-muted-foreground">
                    {t('shell.accountMenu')}
                  </span>
                </span>
                <ChevronsUpDownIcon
                  aria-hidden
                  size={16}
                  className={cn('shrink-0 text-muted-foreground', collapsed && 'md:hidden')}
                />
              </button>
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
          <span className={cn('px-1', collapsed && 'md:hidden')}>
            <LanguageSwitcher />
          </span>
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
          'relative flex min-w-0 flex-1 flex-col bg-background transition-[margin] duration-200',
          // The page is a sheet laid over the dark rail: flush with the top
          // and bottom edges, so every screen's viewport-height maths still
          // holds, with only its leading edge rounded.
          'md:z-10 md:-ml-3 md:rounded-l-2xl',
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

      <TutorialEntry />
      <TutorialOverlayHost />
    </div>
  );
}

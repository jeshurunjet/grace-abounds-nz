'use client';
import {
  Home,
  Globe,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  FolderOpen,
  CalendarDays,
  FilePenLine,
  Video,
  Users,
  Heart,
  Settings,
  CircleHelp,
  Menu,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Logo } from './logo';
import { NotificationMenu } from './notification-menu';
import Image from 'next/image';
import { accountProfile } from '../lib/profiles';
import {
  getRoleNavigation,
  isManageRoute,
  isRouteActive,
} from '../lib/role-navigation';

/** Stored desktop sidebar choice: 'true' = collapsed, 'false' = expanded. */
export const SIDEBAR_KEY = 'grace-sidebar-collapsed';

export type WorkspaceLink = { href: string; label: string; icon?: string };
export function WorkspaceShell({
  kind,
  links,
  children,
}: {
  kind: 'Admin' | 'Pastor' | 'Members';
  links: WorkspaceLink[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Desktop sidebar: collapsed unless the person chose to expand it. The
  // pre-paint script in layout.tsx sets <html data-sidebar>, which the CSS
  // uses, so there is no flash; this state drives the toggle's labels.
  const [collapsed, setCollapsed] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const { data } = useSession();
  const pathname = usePathname();
  const role =
    data?.user?.role ??
    (kind === 'Admin' ? 'admin' : kind === 'Pastor' ? 'pastor' : 'member');
  const homeHref = getRoleNavigation(role).workspaceHref;
  const profile = accountProfile({ ...data?.user, role });
  useEffect(() => {
    const root = document.documentElement;
    let state = root.dataset.sidebar;
    if (state !== 'collapsed' && state !== 'expanded') {
      state = 'collapsed';
      try {
        if (window.localStorage.getItem(SIDEBAR_KEY) === 'false')
          state = 'expanded';
      } catch {
        /* Navigation still works when browser storage is unavailable. */
      }
      root.dataset.sidebar = state;
    }
    setCollapsed(state === 'collapsed');
  }, []);
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.dataset.sidebar = next ? 'collapsed' : 'expanded';
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(next));
    } catch {
      /* Optional preference only. */
    }
  }
  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
  }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const change = () => {
      setMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const trigger = menuButton.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [],
      );
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', close);
      trigger?.focus();
    };
  }, [open, mobile]);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [accountOpen]);
  return (
    <div className={`workspace${collapsed ? ' workspace-collapsed' : ''}`}>
      <button
        ref={menuButton}
        className="workspace-menu"
        onClick={() => setOpen(true)}
        aria-label="Open workspace menu"
        aria-expanded={open}
        aria-controls="workspace-sidebar"
      >
        <Menu size={20} />
        <span>Menu</span>
      </button>
      <header className="workspace-topbar" inert={mobile && open}>
        {/* The sidebar logo leads home and "Main website" opens the public
            site, so the top bar keeps only notifications and the account. */}
        <div className="workspace-account-controls">
          <NotificationMenu />
          <div className="member-menu" ref={accountRef}>
            <button
              className="profile-avatar-button"
              onClick={() => setAccountOpen((value) => !value)}
              aria-label="Open account menu"
              aria-expanded={accountOpen}
            >
              <Image src={profile.photo} alt="" width={40} height={40} />
            </button>
            {accountOpen && (
              <div className="member-menu-popover">
                <div>
                  <strong>{profile.name}</strong>
                  <small>{profile.title}</small>
                </div>
                <Link
                  href={`/profile/${data?.user?.profileId ?? profile.id}`}
                  onClick={() => setAccountOpen(false)}
                >
                  Profile
                </Link>
                <Link href="/settings" onClick={() => setAccountOpen(false)}>
                  Settings
                </Link>
                <button onClick={() => signOut({ callbackUrl: '/' })}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {open && (
        <button
          className="workspace-scrim"
          onClick={() => setOpen(false)}
          aria-label="Close workspace menu"
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-sidebar"
        aria-label="Workspace menu"
        inert={mobile && !open}
        className={open ? 'open' : ''}
      >
        <div className="workspace-brand">
          <Logo light href={homeHref} />
          <button
            type="button"
            className="workspace-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="workspace-navigation"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
          </button>
          <strong>{kind === 'Members' ? 'Member' : kind} workspace</strong>
          <button
            className="workspace-drawer-close icon-button"
            aria-label="Close workspace menu"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav id="workspace-navigation" aria-label="Workspace navigation">
          {links
            .filter((link) => link.href !== '/members/messages')
            .map((link) => {
              const href = link.label === 'Home' ? homeHref : link.href;
              const active =
                link.label === 'Home'
                  ? ['/members', '/admin', '/pastor'].includes(pathname)
                  : link.label === 'Manage'
                    ? isManageRoute(pathname)
                    : isRouteActive(pathname, link.href);
              const Icon =
                (
                  {
                    'Main website': Globe,
                    Home,
                    Messages: MessageCircle,
                    Resources: FolderOpen,
                    Calendar: CalendarDays,
                    Manage: LayoutGrid,
                    'Website content': FilePenLine,
                    'Manage events': CalendarDays,
                    'Activities & calendar': CalendarDays,
                    'Manage sermons': Video,
                    'Members & roles': Users,
                    'Member activity': Users,
                    'Pastoral care': Heart,
                    Settings,
                    Help: CircleHelp,
                  } as Record<string, typeof Home>
                )[link.label] ?? Home;
              return (
                <Fragment key={link.href}>
                  <Link
                    href={href}
                    aria-label={link.label}
                    title={link.label}
                    key={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span className="workspace-link-label">{link.label}</span>
                  </Link>
                </Fragment>
              );
            })}
        </nav>
      </aside>
      <main inert={mobile && open} className="workspace-content">
        {children}
      </main>
      {pathname !== '/members/messages' && (
        <Link
          href="/members/messages"
          className="workspace-message-fab"
          aria-label="Open messages"
          title="Messages"
          inert={mobile && open}
        >
          <MessageCircle size={23} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

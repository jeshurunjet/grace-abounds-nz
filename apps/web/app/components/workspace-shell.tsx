'use client';
import {
  Home,
  Globe,
  Mail,
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
import { profileById, profileByRole } from '../lib/profiles';
import { isRouteActive } from '../lib/role-navigation';

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
  const profile = profileById(data?.user?.profileId) ?? profileByRole(role);
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
    <div className="workspace">
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
        <div className="workspace-topbar-title">
          <small>{kind === 'Members' ? 'Member' : kind} workspace</small>
          <strong>Grace Abounds International</strong>
        </div>
        <div className="workspace-account-controls">
          <Link href="/" className="workspace-view-site">
            View website
          </Link>
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
          <Logo light />
          <strong>{kind === 'Members' ? 'Member' : kind} workspace</strong>
          <button
            className="workspace-drawer-close icon-button"
            aria-label="Close workspace menu"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Workspace navigation">
          {links.map((link) => {
            const active =
              link.href === '/members'
                ? ['/members', '/admin', '/pastor'].includes(pathname)
                : isRouteActive(pathname, link.href);
            const Icon =
              (
                {
                  'Main website': Globe,
                  Home,
                  Messages: Mail,
                  'Resource gallery': FolderOpen,
                  'Events & calendar': CalendarDays,
                  'Website content': FilePenLine,
                  'Manage events': CalendarDays,
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
                {link.href === '/admin/cms' && (
                  <p className="workspace-nav-caption">Manage</p>
                )}
                <Link
                  href={link.href}
                  key={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  {link.label}
                </Link>
              </Fragment>
            );
          })}
        </nav>
      </aside>
      <main inert={mobile && open} className="workspace-content">
        {children}
      </main>
    </div>
  );
}

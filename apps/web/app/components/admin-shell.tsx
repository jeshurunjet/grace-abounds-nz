'use client';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { WorkspaceShell, type WorkspaceLink } from './workspace-shell';
/** Sidebar links: the same for every role. Staff tools are on Home
 * (StaffTools); Calendar and Gallery are member features every role keeps. */
export function workspaceLinks(): WorkspaceLink[] {
  return [
    { href: '/', label: 'Main website', icon: '⌂' },
    { href: '/members', label: 'Home', icon: '◈' },
    { href: '/members/calendar', label: 'Calendar', icon: '□' },
    { href: '/members/gallery', label: 'Gallery', icon: '▧' },
    { href: '/settings', label: 'Settings', icon: '⚙' },
    { href: '/help', label: 'Help', icon: '?' },
  ];
}
export function AdminShell({ children }: { children: ReactNode }) {
  const { data, status } = useSession();
  const role = data?.user?.role ?? 'member';
  if (status === 'loading')
    return <p className="container">Loading your workspace…</p>;
  return (
    <WorkspaceShell
      kind={role === 'pastor' ? 'Pastor' : 'Admin'}
      links={workspaceLinks()}
    >
      {children}
    </WorkspaceShell>
  );
}

'use client';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { WorkspaceShell, type WorkspaceLink } from './workspace-shell';
export function workspaceLinks(role: string = 'member'): WorkspaceLink[] {
  const links: WorkspaceLink[] = [
    { href: '/', label: 'Main website', icon: '⌂' },
    { href: '/members', label: 'Home', icon: '◈' },
    { href: '/members/messages', label: 'Messages', icon: '✉' },
    { href: '/members/calendar', label: 'Calendar', icon: '□' },
    { href: '/members/gallery', label: 'Resources', icon: '▧' },
  ];
  // Staff tools live on the Manage hub (/admin/manage), one tile each.
  if (role === 'pastor' || role === 'admin')
    links.push({ href: '/admin/manage', label: 'Manage', icon: '▦' });
  links.push({ href: '/settings', label: 'Settings', icon: '⚙' });
  links.push({ href: '/help', label: 'Help', icon: '?' });
  return links;
}
export function AdminShell({ children }: { children: ReactNode }) {
  const { data, status } = useSession();
  const role = data?.user?.role ?? 'member';
  if (status === 'loading')
    return <p className="container">Loading your workspace…</p>;
  return (
    <WorkspaceShell
      kind={role === 'pastor' ? 'Pastor' : 'Admin'}
      links={workspaceLinks(role)}
    >
      {children}
    </WorkspaceShell>
  );
}

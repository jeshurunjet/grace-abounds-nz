'use client';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { WorkspaceShell, type WorkspaceLink } from './workspace-shell';
import { EditorialBar } from './editorial-bar';
export function workspaceLinks(role: string = 'member'): WorkspaceLink[] {
  const links: WorkspaceLink[] = [
    { href: '/', label: 'Main website', icon: '⌂' },
    { href: '/members', label: 'Home', icon: '◈' },
    { href: '/members/messages', label: 'Messages', icon: '✉' },
    { href: '/members/gallery', label: 'Resource gallery', icon: '▧' },
    { href: '/events', label: 'Events & calendar', icon: '□' },
  ];
  if (role === 'pastor' || role === 'admin')
    links.push(
      { href: '/admin/cms', label: 'Website content', icon: '✎' },
      { href: '/admin/events', label: 'Manage events', icon: '◫' },
      { href: '/admin/sermons', label: 'Manage sermons', icon: '▷' },
      {
        href: '/admin/users',
        label: role === 'pastor' ? 'Members & roles' : 'Member activity',
        icon: '◎',
      },
    );
  if (role === 'pastor')
    links.push({ href: '/pastor/care', label: 'Pastoral care', icon: '♡' });
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
      <EditorialBar />
      {children}
    </WorkspaceShell>
  );
}

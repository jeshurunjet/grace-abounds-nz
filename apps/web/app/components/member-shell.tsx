'use client';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { WorkspaceShell } from './workspace-shell';
import { workspaceLinks } from './admin-shell';
export function MemberShell({ children }: { children: ReactNode }) {
  const { data, status } = useSession();
  const role = data?.user?.role ?? 'member';
  if (status === 'loading')
    return <p className="container">Loading your workspace…</p>;
  return (
    <WorkspaceShell
      kind={
        role === 'pastor' ? 'Pastor' : role === 'admin' ? 'Admin' : 'Members'
      }
      links={workspaceLinks()}
    >
      {children}
    </WorkspaceShell>
  );
}

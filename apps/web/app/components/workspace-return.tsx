'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getRoleNavigation } from '../lib/role-navigation';

export function WorkspaceReturn() {
  const { data } = useSession();
  if (!data?.user) return null;
  return (
    <Link
      className="workspace-calendar-return"
      href={getRoleNavigation(data.user.role).workspaceHref}
    >
      <ArrowLeft size={18} aria-hidden="true" /> Back to workspace home
    </Link>
  );
}

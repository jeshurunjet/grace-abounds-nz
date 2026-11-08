import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../auth';
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin');
  if (!['admin', 'pastor'].includes(session.user.role)) redirect('/members');
  return children;
}

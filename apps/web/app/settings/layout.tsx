import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import type { ReactNode } from 'react';
export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!(await auth())) redirect('/login?callbackUrl=/settings');
  return children;
}

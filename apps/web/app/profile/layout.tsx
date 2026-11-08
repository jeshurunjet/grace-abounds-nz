import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../auth';
export default async function ProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/profile/member-michael-tane');
  return children;
}
